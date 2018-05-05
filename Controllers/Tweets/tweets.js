var utils = require('util');
var EventEmitter = require('events').EventEmitter;
var querystring = require('querystring');
var request = require('request');
var fs = require('fs');

function Tweets(){
	EventEmitter.call(this);
}
utils.inherits(Tweets, EventEmitter);



// api keys
var twitter_key = fs.readFileSync(__dirname + "/twitter_key.txt","utf8").toString().trim();
var twitter_secret = fs.readFileSync(__dirname + "/twitter_secret.txt","utf8").toString().trim();
var google_key = fs.readFileSync(__dirname + "/google_key.txt","utf8").toString().trim();

// twitter bearer
var bearer = '';
var valid_bearer = false;
var getting_new_bearer = false;

// queued requests
var request_queue = [];



// base 64 encode a string
function encodeBase64(str) {
	return new Buffer(str).toString('base64');
}

// get the bearer access token from Twitter
function getNewBearer() {
	if (valid_bearer || getting_new_bearer)
		return;
	getting_new_bearer = true;

	var auth = encodeBase64(twitter_key + ':' + twitter_secret);
	var body = 'grant_type=client_credentials';

	var options = {
		'method' : 'POST',
		'uri' : 'https://api.twitter.com/oauth2/token',
		'headers' : {
			'Authorization' : 'Basic ' + auth,
			'Content-Type' : 'application/x-www-form-urlencoded;charset=UTF-8',
			'Content-Length' : body.length
		},
		'body' : body
	};

	request(options, function(err, res, body) {
		body = JSON.parse(body);

		// request failed
		if (err) {
			console.error(err);

		// request returned an error code
		} else if (res.statusCode !== 200) {
			console.error('Status code was not 200');
			console.error(body);

		// request returned the wrong token
		} else if (body.token_type !== 'bearer') {
			console.error('Key received was not \'bearer\'');
			console.error(body);

		// request succeeded
		} else {
			bearer = body.access_token;
			valid_bearer = true;
			getting_new_bearer = false;
			makeQueuedRequests();
		}

		getting_new_bearer = false;
	});
}



function enqueueRequest(search_query, callback) {
	request_queue.push({
		'search_query' : search_query,
		'callback' : callback
	});
}

function makeQueuedRequests() {
	while (valid_bearer && request_queue.length !== 0) {
		req = request_queue.pop();
		makeTwitterRequest(req.search_query, req.callback);
	}
}

function makeTwitterRequest(search_query, callback) {
	var host = 'https://api.twitter.com';
	var path = '/1.1/search/tweets.json?';
	var query = querystring.stringify({
		'q' : search_query,
		'count' : 450,
		'result_type' : 'recent'
	});

	var options = {
		'method' : 'GET',
		'uri' : host + path + query,
		'headers' : {
			'Authorization' : 'Bearer ' + bearer,
			'Content-Type' : 'application/json;charset=UTF-8'
		}
	};

	request.get(options, function(err, res, body) {
		body = JSON.parse(body);

		// request failed
		if (err) {
			console.error(err);
			callback(true);
			return;
		}

		// success!
		if (res.statusCode === 200) {
			callback(false, body);
			return;
		}

		// collect error codes and messages
		var error_codes = {};
		if ('errors' in body) {
			body.errors.forEach(function(err) {
				error_codes[err.code.toString()] = err.message;
			});

		} else {
			console.err(body);
			callback(true);
			return;
		}

		// authentication failed
		if ('89' in error_codes) {
			valid_bearer = false;
			enqueueRequest(search_query, callback);
			getNewBearer();

		// unknown error
		} else {
			console.error(error_codes);
			callback(true);
		}
	});
}

function countryFromCooordinates(coords, callback) {
	countryFromDescription(coords[0] + ' ' + coords[1], callback);
}

function searchGoogle(text, callback) {
	var host = 'https://maps.googleapis.com';
	var path = '/maps/api/place/textsearch/json?';
	var query = querystring.stringify({
		'key' : google_key,
		'query' : text
	});

	var options = {
		'method' : 'GET',
		'uri' : host + path + query,
		'headers' : {
			'Content-Type' : 'application/json;charset=UTF-8'
		}
	};

	request.get(options, function(err, res, body) {
		body = JSON.parse(body);

		// request failed
		if (err) {
			console.error(err);
			callback(true);

		// request returned a failure code
		} else if (res.statusCode !== 200) {
			console.error(body);
			callback(true);

		// no results
		} else if (body.status !== 'OK') {
			callback(true);

		// success!
		} else {
			var loc = body.results[0].geometry.location;
			countryFromDescription(loc.lat + ' ' + loc.lng, callback);
		}
	});
}

function countryFromDescription(text, callback) {
	var host = 'https://www.meteoblue.com';
	var path = '/en/server/search/query3?';
	var query = querystring.stringify({
		'query' : text
	});

	var options = {
		'method' : 'GET',
		'uri' : host + path + query,
		'headers' : {
			'Content-Type' : 'application/json;charset=UTF-8'
		}
	};

	request.get(options, function(err, res, body) {
		body = JSON.parse(body);

		// request failed
		if (err) {
			console.error(err);
			callback(true);

		// request returned a failure code
		} else if (res.statusCode !== 200) {
			console.error(body);
			callback(true);

		// no results
		} else if (body.results.length === 0) {
			callback(true);

		// success!
		} else {
			callback(false, body.results[0].iso2);
		}
	});
}

function getLocation(tweet, callback) {
	if (tweet.place !== null && tweet.place.country_code !== null) {
		callback(false, tweet.place.country_code);

	} else if (tweet.coordinates !== null) {
		countryFromCooordinates(tweet.coordinates, callback);

	} else if (tweet.user.location !== '') {
		countryFromDescription(tweet.user.location, function(err, data) {
			if (err) {
				searchGoogle(tweet.user.location, callback);

			} else {
				callback(false, data);
			}
		});

	} else {
		callback(false, '');
	}
}

function reduceTweet(tweet, callback) {
	getLocation(tweet, function(err, country) {
		if (err) {
			callback(true);

		} else {
			callback(false, {
				//'id' : tweet.id_str,
				'tweet' : tweet.text,
				'location' : country,
				//'datetime' : tweet.created_at
			});
		}
	});
}

function search(search_query, callback) {
	if (valid_bearer) {
		makeTwitterRequest(search_query, function(err, data) {
			if (err) {
				callback(true);
				return;
			}

			var i = data.statuses.length;
			var tweets = [];

			data.statuses.forEach(function(t) {
				reduceTweet(t, function(err, tweet) {
					i -= 1;

					if (!err) {
						tweets.push(tweet);
					}

					if (i === 0) {
						callback(false, {
							'tweets' : tweets,
							'query' : data.search_metadata.query
						});
					}
				});
			});

		});

	} else {
		enqueueRequest(search_query, callback);
		getNewBearer();
	}
}

// Gets tweets pertaining to a particular hashtag, with location data
Tweets.prototype.getTweets = function(hashtag) {
	self = this;
	search('#' + hashtag, function(err, res) {
		if (err) {
			res = [];
		}
		self.emit('tweetsResponse', res.tweets);
	});
};



getNewBearer();
module.exports = Tweets;
