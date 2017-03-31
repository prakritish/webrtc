$( function() {
'use strict';
var isChannelReady = false;
var isInitiator = false;
var isStarted = false;
var localStream;
var pc;
var remoteStream;
var turnReady;
var sendChannel;
var receiveChannel;
 var pcConfig = {
  'iceServers': [
    {'url': 'stun:stun.l.google.com:19302'},
	{'url': 'stun:stun1.l.google.com:19302'},
	{'url': 'stun:stun2.l.google.com:19302'},
	{'url': 'stun:stun3.l.google.com:19302'},
	{'url': 'stun:stun4.l.google.com:19302'},
	{'url': 'stun:stun.xten.com'},
	{
		'url': 'turn:numb.viagenie.ca',
		'username': 'webrtc@yahoo.com',
		'credential': 'webrtc1234'
	}]
};

// Set up audio and video regardless of what devices are present.
var sdpConstraints = {
  'mandatory': {
    'OfferToReceiveAudio': true,
    'OfferToReceiveVideo': true
  }
};

/////////////////////////////////////////////

function timeStamp() {
	var now = new Date();
	var date = [ now.getMonth() + 1, now.getDate(), now.getFullYear() ];
	var time = [ now.getHours(), now.getMinutes(), now.getSeconds() ];
	var offset = new Date().getTimezoneOffset(), o = Math.abs(offset);
	var tz = (offset < 0 ? "+" : "-") + ("00" + Math.floor(o / 60)).slice(-2) + ":" + ("00" + (o % 60)).slice(-2);
	return date.join("/") + " " + time.join(":") + " " + tz;
}

var allFields = $( [] ).add( user ).add( room ),
tips = $( ".validateTips" );
var dialog = $( "#dialog-form" ).dialog({
    autoOpen: false,
    height: 400,
    width: 350,
    modal: true,
    buttons: {
        "Submit": addRoom,
        Cancel: function() {
            dialog.dialog( "close" );
        }
    },
    close: function() {
        form[ 0 ].reset();
        allFields.removeClass( "ui-state-error" );
        }
});

var form = dialog.find( "form" ).on( "Submit", function( event ) {
    event.preventDefault();
    addRoom();
});

var getUrlParameter = function getUrlParameter(sParam) {
    var sPageURL = decodeURIComponent(window.location.search.substring(1)),
        sURLVariables = sPageURL.split('&'),
        sParameterName,
        i;

    for (i = 0; i < sURLVariables.length; i++) {
        sParameterName = sURLVariables[i].split('=');

        if (sParameterName[0] === sParam) {
            return sParameterName[1] === undefined ? true : sParameterName[1];
        }
    }
};

function updateTips( t ) {
    tips
        .text( t )
        .addClass( "ui-state-highlight" );
    setTimeout(function() {
        tips.removeClass( "ui-state-highlight", 1500 );
        }, 500 );
}

function checkLength( o, n, min, max ) {
    if ( o.val().length > max || o.val().length < min ) {
        o.addClass( "ui-state-error" );
        updateTips( "Length of " + n + " must be between " +
                min + " and " + max + "." );
        return false;
    } else {
        return true;
    }
}

function checkRegexp( o, regexp, n ) {
    if ( !( regexp.test( o.val() ) ) ) {
        o.addClass( "ui-state-error" );
        updateTips( n );
        return false;
    } else {
        return true;
    }
}

room = getUrlParameter('room');
user = getUrlParameter('user');
if (typeof(room) === 'undefined') {
    if ( typeof(Storage) !== "undefined" ) {
        room = sessionStorage.room;
    }
    if (typeof(room) === 'undefined') {
        dialog.dialog( "open" );
    }
}

function addRoom() {
    var roomField = $('#room');
    var userField = $('#user');
    var valid = true;
    allFields.removeClass( "ui-state-error" );
    valid = valid && checkLength( roomField, "room", 4, 8 );
    valid = valid && checkLength( userField, "username", 3, 25 );
    valid = valid && checkRegexp( userField, /^[a-z]([0-9a-z_\s])+$/i, "Username may consist of a-z, 0-9, underscores, spaces and must begin with a letter." );
    valid = valid && checkRegexp( roomField, /^[a-z0-9]+$/i, "Room may consist of a-z and 0-9 and between 4-8 characters." );

    if ( valid ) {
    	room = roomField.val();
    	user = userField.val();
        dialog.dialog( "close" );
	    if ( typeof(Storage) !== "undefined" ) {
	    	sessionStorage.room = room;
	    	sessionStorage.user = user;
	    }
	    socket.emit('create or join', room);
    }
    return valid;
}

var socket = io.connect();

if (typeof(room) !== 'undefined' && room !== '') {
  socket.emit('create or join', room);
  console.log('Attempted to create or  join room', room);
}

socket.on('created', function(room) {
  console.log('Created room ' + room);
  isInitiator = true;
});

socket.on('full', function(room) {
  console.log('Room ' + room + ' is full');
});

socket.on('join', function (room){
  console.log('Another peer made a request to join room ' + room);
  console.log('This peer is the initiator of room ' + room + '!');
  isChannelReady = true;
});

socket.on('joined', function(room) {
  console.log('joined: ' + room);
  isChannelReady = true;
});

socket.on('log', function(array) {
  console.log.apply(console, array);
});

////////////////////////////////////////////////

function sendMessage(message) {
  console.log('Client sending message: ', message);
  socket.emit('message', message);
}

// This client receives a message
socket.on('message', function(message) {
  console.log('Client received message:', message);
  if (message === 'got user media') {
    maybeStart();
  } else if (message.type === 'offer') {
    if (!isInitiator && !isStarted) {
      maybeStart();
    }
    pc.setRemoteDescription(new RTCSessionDescription(message));
    doAnswer();
  } else if (message.type === 'answer' && isStarted) {
    pc.setRemoteDescription(new RTCSessionDescription(message));
  } else if (message.type === 'candidate' && isStarted) {
    var candidate = new RTCIceCandidate({
      sdpMLineIndex: message.label,
      candidate: message.candidate
    });
    pc.addIceCandidate(candidate);
  } else if (message === 'bye' && isStarted) {
    handleRemoteHangup();
  }
});

////////////////////////////////////////////////////

var localVideo = document.querySelector('#localVideo');
var remoteVideo = document.querySelector('#remoteVideo');
var sendButton = document.querySelector('button#sendButton');
sendButton.disabled = true;
var dataChannelSend = document.querySelector('#dataChannelSend');
dataChannelSend.disabled = true;
var dataChannelReceive = document.querySelector('#dataChannelReceive');
dataChannelReceive.disabled = true;
var audioSelect = document.querySelector('#audio');
var videoSelect = document.querySelector('#video');
audioSelect.onchange = function() {
	if (typeof(localStream) !== 'undefined') {
		if (audioSelect.checked) {
			console.log("Audio is Enabled");
			localStream.getAudioTracks()[0].enabled = true;
		} else {
			console.log("Audio is Disabled");
			localStream.getAudioTracks()[0].enabled = false;
		}
	}
};

videoSelect.onchange = function() {
	if (typeof(localStream) !== 'undefined') {
		if (videoSelect.checked) {
			console.log('Video is Enabled');
			localStream.getVideoTracks()[0].enabled = true;
		} else {
			console.log('Video is Disabled');
			localStream.getVideoTracks()[0].enabled = false;
		}
	}
};

sendButton.onclick = sendData;

var mediaConnect = document.querySelector('#mediaConnect');
mediaConnect.onclick = getMedia;

function getMedia() {
	navigator.mediaDevices.getUserMedia({
	  audio: audioSelect.checked,
	  video: videoSelect.checked
	})
	.then(gotStream)
	.catch(function(e) {
	  alert('getUserMedia() error: ' + e.name);
	});
}

function gotStream(stream) {
	console.log('Adding local stream.');
	localVideo.src = window.URL.createObjectURL(stream);
	localStream = stream;
	sendMessage('got user media');
	localVideo.controls = true;
	if (isInitiator) {
	    maybeStart();
	}
	if (!audioSelect.checked) {
		audioSelect.disabled = true;
	}
	if (!videoSelect.checked) {
		videolSelect.disabled = true;
	}
}

if (location.hostname !== 'localhost') {
  requestTurn(
    'https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913'
  );
}

function maybeStart() {
  console.log('>>>>>>> maybeStart() ', isStarted, localStream, isChannelReady);
  if (!isStarted && typeof localStream !== 'undefined' && isChannelReady) {
    console.log('>>>>>> creating peer connection');
    createPeerConnection();
    pc.addStream(localStream);
    isStarted = true;
    console.log('isInitiator', isInitiator);
    if (isInitiator) {
      doCall();
    }
  }
}

window.onbeforeunload = function() {
  sendMessage('bye');
};

/////////////////////////////////////////////////////////

function sendData() {
	var data = dataChannelSend.value;
	var outData = timeStamp() + "\n" + user + ' : ' + data + "\n";
	sendChannel.send(outData);
	if(typeof(Storage) !== "undefined") {
		if (sessionStorage.message) {
			sessionStorage.message += outData;
		} else {
			sessionStorage.message = outData;
		}
		dataChannelReceive.value = sessionStorage.message;
	} else {
		dataChannelReceive.value = new Date() + event.data;
	}
	dataChannelSend.value = '';
	console.log('Sent Data: ' + data);
}

function onSendChannelStateChange() {
	var readyState = sendChannel.readyState;
	console.log('Send channel state is: ' + readyState);
	if (readyState === 'open') {
	    dataChannelSend.disabled = false;
	    sendButton.disabled = false;
	    dataChannelReceive.disabled = false;
	} else {
	    dataChannelSend.disabled = true;
	    sendButton.disabled = true;
	    dataChannelReceive.disabled = true;
	}
}

function receiveChannelCallback(event) {
	console.log('Receive Channel Callback');
	receiveChannel = event.channel;
	receiveChannel.onmessage = onReceiveMessageCallback;
}

function onReceiveMessageCallback(event) {
	console.log('Received Message');
	if(typeof(Storage) !== "undefined") {
		if (sessionStorage.message) {
			sessionStorage.message += event.data;
		} else {
			sessionStorage.message = event.data;
		}
		dataChannelReceive.value = sessionStorage.message;
	} else {
		dataChannelReceive.value = new Date() + event.data;
	}
}

function createPeerConnection() {
  try {
    pc = new RTCPeerConnection(null);
    pc.onicecandidate = handleIceCandidate;
    pc.onaddstream = handleRemoteStreamAdded;
    pc.onremovestream = handleRemoteStreamRemoved;
    console.log('Created RTCPeerConnnection');
    sendChannel = pc.createDataChannel('sendDataChannel', null);
    sendChannel.onopen = onSendChannelStateChange;
    console.log('Created Data Channel');
    pc.ondatachannel = receiveChannelCallback;
  } catch (e) {
    console.log('Failed to create PeerConnection, exception: ' + e.message);
    alert('Cannot create RTCPeerConnection object.');
    return;
  }
}

function handleIceCandidate(event) {
  console.log('icecandidate event: ', event);
  if (event.candidate) {
    sendMessage({
      type: 'candidate',
      label: event.candidate.sdpMLineIndex,
      id: event.candidate.sdpMid,
      candidate: event.candidate.candidate
    });
  } else {
    console.log('End of candidates.');
  }
}

function handleRemoteStreamAdded(event) {
  console.log('Remote stream added.');
  remoteVideo.src = window.URL.createObjectURL(event.stream);
  remoteVideo.controls = true;
  remoteStream = event.stream;
}

function handleCreateOfferError(event) {
  console.log('createOffer() error: ', event);
}

function doCall() {
  console.log('Sending offer to peer');
  pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
}

function doAnswer() {
  console.log('Sending answer to peer.');
  pc.createAnswer().then(
    setLocalAndSendMessage,
    onCreateSessionDescriptionError
  );
}

function setLocalAndSendMessage(sessionDescription) {
  // Set Opus as the preferred codec in SDP if Opus is present.
  //  sessionDescription.sdp = preferOpus(sessionDescription.sdp);
  pc.setLocalDescription(sessionDescription);
  console.log('setLocalAndSendMessage sending message', sessionDescription);
  sendMessage(sessionDescription);
}

function onCreateSessionDescriptionError(error) {
  trace('Failed to create session description: ' + error.toString());
}

function requestTurn(turnURL) {
  var turnExists = false;
  for (var i in pcConfig.iceServers) {
    if (pcConfig.iceServers[i].url.substr(0, 5) === 'turn:') {
      turnExists = true;
      turnReady = true;
      break;
    }
  }
  if (!turnExists) {
    console.log('Getting TURN server from ', turnURL);
    // No TURN server. Get one from computeengineondemand.appspot.com:
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4 && xhr.status === 200) {
        var turnServer = JSON.parse(xhr.responseText);
        console.log('Got TURN server: ', turnServer);
        pcConfig.iceServers.push({
          'url': 'turn:' + turnServer.username + '@' + turnServer.turn,
          'credential': turnServer.password
        });
        turnReady = true;
      }
    };
    xhr.open('GET', turnURL, true);
    xhr.send();
  }
}

function handleRemoteStreamAdded(event) {
  console.log('Remote stream added.');
  remoteVideo.src = window.URL.createObjectURL(event.stream);
  remoteStream = event.stream;
}

function handleRemoteStreamRemoved(event) {
  console.log('Remote stream removed. Event: ', event);
}

function hangup() {
  console.log('Hanging up.');
  stop();
  sendMessage('bye');
  mediaConnect.innerHTML = "Connect";
  mediaConnect.onclick = getMedia;
}

function handleRemoteHangup() {
  console.log('Session terminated.');
  stop();
  isInitiator = false;
}

function stop() {
  isStarted = false;
  // isAudioMuted = false;
  // isVideoMuted = false;
  pc.close();
  pc = null;
}

///////////////////////////////////////////

// Set Opus as the default audio codec if it's present.
function preferOpus(sdp) {
  var sdpLines = sdp.split('\r\n');
  var mLineIndex;
  // Search for m line.
  for (var i = 0; i < sdpLines.length; i++) {
    if (sdpLines[i].search('m=audio') !== -1) {
      mLineIndex = i;
      break;
    }
  }
  if (mLineIndex === null) {
    return sdp;
  }

  // If Opus is available, set it as the default in m line.
  for (i = 0; i < sdpLines.length; i++) {
    if (sdpLines[i].search('opus/48000') !== -1) {
      var opusPayload = extractSdp(sdpLines[i], /:(\d+) opus\/48000/i);
      if (opusPayload) {
        sdpLines[mLineIndex] = setDefaultCodec(sdpLines[mLineIndex],
          opusPayload);
      }
      break;
    }
  }

  // Remove CN in m line and sdp.
  sdpLines = removeCN(sdpLines, mLineIndex);

  sdp = sdpLines.join('\r\n');
  return sdp;
}

function extractSdp(sdpLine, pattern) {
  var result = sdpLine.match(pattern);
  return result && result.length === 2 ? result[1] : null;
}

// Set the selected codec to the first in m line.
function setDefaultCodec(mLine, payload) {
  var elements = mLine.split(' ');
  var newLine = [];
  var index = 0;
  for (var i = 0; i < elements.length; i++) {
    if (index === 3) { // Format of media starts from the fourth.
      newLine[index++] = payload; // Put target payload to the first.
    }
    if (elements[i] !== payload) {
      newLine[index++] = elements[i];
    }
  }
  return newLine.join(' ');
}

// Strip CN from sdp before CN constraints is ready.
function removeCN(sdpLines, mLineIndex) {
  var mLineElements = sdpLines[mLineIndex].split(' ');
  // Scan from end for the convenience of removing an item.
  for (var i = sdpLines.length - 1; i >= 0; i--) {
    var payload = extractSdp(sdpLines[i], /a=rtpmap:(\d+) CN\/\d+/i);
    if (payload) {
      var cnPos = mLineElements.indexOf(payload);
      if (cnPos !== -1) {
        // Remove CN payload from m line.
        mLineElements.splice(cnPos, 1);
      }
      // Remove CN line in sdp
      sdpLines.splice(i, 1);
    }
  }

  sdpLines[mLineIndex] = mLineElements.join(' ');
  return sdpLines;
}
});