
//  
//  Mimic
//  Made by 1lann and GravityScore
//  



String.prototype.repeat = function(num) {
	return new Array(num + 1).join(this);
}


// Lua State
var C = Lua5_1.C;
var L = C.lua_open();
var doShutdown = false;
var doReboot = false;


// Thread
var thread = {
	"main": null,
	"alive": false,
};


// OS
var computer = {
	"id": 0,
	"label": null,

	"eventStack": [],
	"lastTimerID": 0,
};

var startClock;
var coroutineClock;


// Terminal
var term = {
	"width": 51,
	"height": 19,
	"cursorX": 1,
	"cursorY": 1,
	"textColor": "f",
	"backgroundColor": "0",
	"cursorBlink": false,
	"cursorFlash": true,
};



//  ----------------  APIs  ----------------  //


var loadAPIs = function() {
	var apis = {
		"bit": bitAPI,
		"fs": fsAPI,
		"http": httpAPI,
		"os": osAPI,
		"peripheral": peripheralAPI,
		"term": termAPI,
	};

	Lua5_1.Runtime.functionPointers = [];
	for (var i = 1; i <= 512; i++) {
		Lua5_1.Runtime.functionPointers.push(null);
	}

	C.luaL_openlibs(L);

	for (var api in apis) {
		if (typeof(apis[api]) == "function") {
			C.lua_pushcfunction(L, Lua5_1.Runtime.addFunction(apis[api]));
			C.lua_setfield(L, 1, api)
		} else {
			C.lua_newtable(L);
			for (var key in apis[api]) {
				C.lua_pushcfunction(L, Lua5_1.Runtime.addFunction(apis[api][key]));
				C.lua_setfield(L, 1, key)
			}
			C.lua_setglobal(L, api);
		}
	}
}



//  ----------------  Threading  ----------------  //


callLua = function(data) {
	C.luaL_dostring(L, data);
}


threadHang = function() {
	thread.alive = false;
	for (var i = 1; i <= term.height; i++) {
		render.text(1, i, " ".repeat(term.width), "0", "4");
	}

	var errorOne = "The Lua thread had hung, and has been";
	var errorTwo = "been terminated. This is equivelant to";
	var errorThree = "\"Too long without yielding.\"";
	var errorFour = "Please reboot the computer";
	var startOne = Math.round((term.width / 2) - ((errorOne.length) / 2));
	var startTwo = Math.round((term.width / 2) - ((errorTwo.length) / 2));
	var startThree = Math.round((term.width / 2) - ((errorThree.length) / 2));
	var startFour = Math.round((term.width / 2) - ((errorFour.length) / 2));
	term.cursorBlink = false;
	render.text(16, 7, "FATAL : THREAD HANG", "4", "f");
	render.text(startOne, 9, errorOne, "f", "4");
	render.text(startTwo, 10, errorTwo, "f", "4");
	render.text(startThree, 11, errorThree, "f", "4");
	render.text(startFour, 13, errorFour, "f", "4");
}


resumeThread = function() {
	if (!thread.alive) {
		return;
	}

	var threadLoopID = setInterval(function() {
		if (computer.eventStack.length > 0) {
			var argumentsNumber = computer.eventStack[0].length;

			for (var index in computer.eventStack[0]) {
				var argument = computer.eventStack[0][index];
				if (typeof(argument) == "string") {
					C.lua_pushstring(thread.main, argument);
				} else if (typeof(argument) == "number") {
					C.lua_pushnumber(thread.main, argument);
				} else if (typeof(argument) == "boolean") {
					C.lua_pushboolean(thread.main, argument ? 1 : 0);
				} else if (typeof(argument) == "object") {
					C.lua_pushstring(thread.main, filesystem.serializeTable(argument));
				} else {
					C.lua_pushstring(thread.main, argument.toString());
				}
			}

			computer.eventStack.splice(0, 1);

			coroutineClock = Date.now();
			var resp = C.lua_resume(thread.main, argumentsNumber);
			if (resp == C.LUA_YIELD) {
				if (doShutdown) {
					shutdown();
					return;
				} else if (doReboot) {
					reboot();
					return;
				}
			} else if (resp == 0) {
				clearInterval(threadLoopID);
				thread.alive = false;
				console.log("Program ended. Closing thread.");
			} else {
				console.log("Error occurred. Closing thread.")
				console.log("Error: " + C.lua_tostring(thread.main, -1));
				clearInterval(threadLoopID);
				thread.alive = false;
			}
		} else {
			clearInterval(threadLoopID);
		}
	}, 10);
}


var initialization = function() {
	for (var i = 1; i <= term.height; i++) {
		render.text(1, i, " ".repeat(term.width), "f", "0");
	}

	var resp = C.lua_resume(thread.main, 0);
	if (resp != C.LUA_YIELD && resp != 0) {
		var errorCode = C.lua_tostring(thread.main, -1);
		var trace = C.lua_tostring(thread.main, -3);

		console.log("Intialization Error: " + errorCode);
		thread.alive = false;
		console.log("Thread closed");

		for (var i = 1; i <= term.height; i++) {
			render.text(1, i, " ".repeat(term.width), "f", "4");
		}

		var startPos = Math.round((term.width / 2) - ((7 + errorCode.length) / 2));
		term.cursorBlink = false;
		render.text(16, 7, "FATAL : BIOS ERROR", "4", "f");
		render.text(startPos, 9, "ERROR: " + errorCode, "f", "4");

		if (trace) {
			console.log("Trace: " + trace);
			render.text(9, 11, "-- SEE CONSOLE FOR STACK TRACE --", "f", "4");
		}
	}
}



//  ----------------  Main  ----------------  //


var setup = function(callback) {
	render.setup(function() {
		filesystem.setup(function(err) {
			if (err) {
				return;
			}

			callback();
		});
	});
}


var run = function() {
	loadAPIs();

	setInterval(function() {
		term.cursorFlash = !term.cursorFlash;
		render.cursorBlink();
	}, 500);

	thread.main = C.lua_newthread(L);
	C.luaL_loadstring(thread.main, getCode());
	thread.alive = true;

	startClock = Date.now();
	coroutineClock = Date.now();

	initialization();
}

var boot = function() {
	if (thread.alive || L) {
		console.error("Cannot boot if computer is still on!")
		return;
	}
	coroutineClock = Date.now();

	L = C.lua_open();
	loadAPIs();

	thread.main = C.lua_newthread(L);
	C.luaL_loadstring(thread.main, getCode());
	thread.alive = true;

	startClock = Date.now();

	initialization();
}


var shutdown = function() {
	coroutineClock = Date.now();

	if (L) {
		C.lua_close(L);
	}

	for (var i = 1; i <= term.height; i++) {
		render.text(1, i, " ".repeat(term.width), "0", "0");
	}

	L = null;

	doShutdown = false;
	doReboot = false;

	thread.main = null;
	thread.alive = false;

	term.cursorX = 1;
	term.cursorY = 1;
	term.textColor = "f";
	term.backgroundColor = "0";
	term.cursorBlink = false;

	computer.eventStack = [];
	computer.lastTimerID = 0;
}


var reboot = function() {
	shutdown();
	boot();
}


var main = function() {
	setup(function() {
		run();
	});
};
