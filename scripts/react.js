// Description:
//   Train hubot to react to certain terms.
//
// Dependencies:
//   underscore: ~1.7.0
//   natural: ~0.1.28
//   moment: ~2.8.3
//   msgpack: ~0.2.4
//
// Configuration:
//   HUBOT_REACT_STORE_SIZE=N - Remember at most N messages (default 200).
//   HUBOT_REACT_THROTTLE_EXPIRATION=N - Throttle responses to the same terms for N seconds (default 300).
//   HUBOT_REACT_INIT_TIMEOUT=N - wait for N milliseconds for brain data to load from redis. (default 10000)
//
// Commands:
//   hubot react <term> <response> - tell hubot to react with <response> when it hears <term> (single word)
//   hubot react "<term>" <response> - tell hubot to react with <response> when it hears <term> (multiple words)
//   hubot ignore that - tell hubot to forget the last <term> <response> pair that was uttered.
//
// Author:
//   b3nj4m

var _ = require('underscore');
var natural = require('natural');
var moment = require('moment');
var msgpack = require('msgpack');

var stemmer = natural.PorterStemmer;
var ngrams = natural.NGrams.ngrams;

var STORE_SIZE = process.env.HUBOT_REACT_STORE_SIZE ? parseInt(process.env.HUBOT_REACT_STORE_SIZE) : 200;
var THROTTLE_EXPIRATION = process.env.HUBOT_REACT_THROTTLE_EXPIRATION ? parseInt(process.env.HUBOT_REACT_THROTTLE_EXPIRATION) : 300;
var INIT_TIMEOUT = process.env.HUBOT_REACT_INIT_TIMEOUT ? parseInt(process.env.HUBOT_REACT_INIT_TIMEOUT) : 10000;

var lastUsedResponse = null;

var successTmpl = _.template('Reacting to <%= term %> with <%= response %>');
var responseTmpl = _.template('<%= response %>');
var ignoredTmpl = _.template('No longer reacting to <%= term %> with <%= response %>');
var lastResponseNotFoundTmpl = _.template('Wat.');

function randomItem(list) {
  return list[_.random(list.length - 1)];
}

function responseToString(response) {
  return responseTmpl(response);
}

function successMessage(response) {
  return successTmpl(response);
}

function ignoredMessage(response) {
  return ignoredTmpl(response);
}

function lastResponseNotFoundMessage() {
  return lastResponseNotFoundTmpl();
}

function getResponses(retrieve, store, text) {
  text = text.toLowerCase();
  var stems = stemmer.tokenizeAndStem(text).sort();
  var messageStore = retrieve('reactMessageStore');
  var termSizes = retrieve('reactTermSizes');
  var responseUsageTimes = retrieve('reactResponseUsageTimes');

  return _.flatten(_.compact(_.map(termSizes, function(count, size) {
    size = parseInt(size);

    //generate ngrams for sizes for which there are terms to react to
    if (size > 0) {
      return _.flatten(_.compact(_.map(ngrams(stems, size), function(ngram) {
        ngramString = ngram.join(',');

        if (messageStore[ngramString] === undefined || responseShouldBeThrottled(responseUsageTimes, ngramString)) {
          return null;
        }

        return _.values(messageStore[ngramString]);
      })));
    }
    //test exact matches
    else if (size === 0) {
      return _.flatten(_.compact(_.map(messageStore, function(responses, key) {
        return text.indexOf(key) > -1 && !responseShouldBeThrottled(responseUsageTimes, key) ? _.values(responses) : null;
      })));
    }

    return null;
  })));
}

function deleteItem(messageStore, termSizes, stemsString, key) {
  termSizes[messageStore[stemsString][key].stems.length]--;
  delete messageStore[stemsString][key];

  if (_.isEmpty(messageStore[stemsString])) {
    delete messageStore[stemsString];
  }
}

function ensureStoreSize(messageStore, termSizes, size) {
  var storeSize = _.reduce(_.values(messageStore), function(memo, value) {
    return memo + _.size(value);
  }, 0);

  var keys = _.keys(_.first(messageStore));
  var key;
  var termKeys;
  var termKey;
  while (storeSize > size) {
    key = randomItem(keys);
    termKeys = _.keys(messageStore[key]);

    if (termKeys.length > 0) {
      termKey = randomItem(termKeys);
      deleteItem(messageStore, termSizes, key, termKey);

      storeSize--;
    }
  }
}

function addResponse(retrieve, store, term, response) {
  //only use stemmer for things that look like words
  var stems = /^[\w\s]+$/i.test(term) ? stemmer.tokenizeAndStem(term).sort() : [];
  var stemsString = stems.join(',') || term.toLowerCase();
  var messageStore = retrieve('reactMessageStore');
  var termSizes = retrieve('reactTermSizes');

  ensureStoreSize(messageStore, termSizes, STORE_SIZE - 1);

  //TODO add preceding underscore or something to keys in case they conflict with read-only object properties
  messageStore[stemsString] = messageStore[stemsString] || {};

  messageStore[stemsString][response] = {
    term: term,
    stems: stems,
    stemsString: stemsString,
    response: response
  };

  //keep track of number of words in each term so we know what sizes of ngrams to generate
  //terms with empty stems (e.g. @#$) will have termSize 0
  termSizes[stems.length] = termSizes[stems.length] ? termSizes[stems.length] + 1 : 1;

  store('reactMessageStore', messageStore);
  store('reactTermSizes', termSizes);

  return messageStore[stemsString][response];
}

function deleteResponse(retrieve, store, response) {
  var messageStore = retrieve('reactMessageStore');
  var termSizes = retrieve('reactTermSizes');

  if (messageStore[response.stemsString] !== undefined && messageStore[response.stemsString][response.response] !== undefined) {
    deleteItem(messageStore, termSizes, response.stemsString, response.response);

    store('reactMessageStore', messageStore);
    store('reactTermSizes', termSizes);

    return true;
  }
  return false;
}

function updateResponseUsageTime(retrieve, store, response) {
  var responseUsageTimes = retrieve('reactResponseUsageTimes');

  responseUsageTimes[response.stemsString || response.term] = moment.utc().toISOString();

  store('reactResponseUsageTimes', responseUsageTimes);
}

function responseShouldBeThrottled(responseUsageTimes, stemsString) {
  return responseUsageTimes[stemsString] !== undefined && moment.utc(responseUsageTimes[stemsString]).add(THROTTLE_EXPIRATION, 'seconds').isAfter();
}

function computeTermSizes(messageStore) {
  return _.reduce(messageStore, function(memo, responses, stemsString) {
    var stems = stemsString.split(',');
    memo[stems.length.toString()] = memo[stems.length] ? memo[stems.length] + 1 : 1;
    return memo;
  }, {});
}

function serialize(data) {
  var string;

  try {
    string = msgpack.pack(data);
  }
  catch (err) {
    //emit error?
  }

  return string;
}

function deserialize(string) {
  var data;

  //legacy (3.x and older) data was stored as JSON
  try {
    data = JSON.parse(string);
  }
  catch (err) {
    //emit error?
  }

  //new data is stored as msgpack
  if (!data) {
    try {
      data = msgpack.unpack(new Buffer(string));
    }
    catch (err) {
      //emit error?
    }
  }

  return data;
}

function robotStore(robot, key, data) {
  return robot.brain.set(key, serialize(data));
}

function robotRetrieve(robot, key) {
  return deserialize(robot.brain.get(key));
}

function start(robot) {
  var store = robotStore.bind(this, robot);
  var retrieve = robotRetrieve.bind(this, robot);

  var get = getResponses.bind(this, retrieve, store);
  var add = addResponse.bind(this, retrieve, store);
  var del = deleteResponse.bind(this, retrieve, store);
  var responseUsed = updateResponseUsageTime.bind(this, retrieve, store);

  robot.brain.setAutoSave(true);

  if (!retrieve('reactResponseUsageTimes')) {
    store('reactResponseUsageTimes', {});
  }

  var messageStore = retrieve('reactMessageStore');
  if (!_.isObject(messageStore)) {
    messageStore = {};
  }

  var termSizes = retrieve('reactTermSizes');
  if (!_.isObject(termSizes)) {
    termSizes = computeTermSizes(messageStore);
  }

  ensureStoreSize(messageStore, termSizes, STORE_SIZE);

  store('reactMessageStore', messageStore);
  store('reactTermSizes', termSizes);

  var hubotMessageRegex = new RegExp('^[@]?(' + robot.name + ')' + (robot.alias ? '|(' + robot.alias + ')' : '') + '[:,]?\\s', 'i');

  robot.respond(/react ("([^"]*)"|([^\s]*)) (.*)/i, function(msg) {
    var term = msg.match[2] || msg.match[3];
    var response = msg.match[4];

    var responseObj = add(term, response);

    msg.send(successMessage(responseObj));
  });

  robot.respond(/ignore that/i, function(msg) {
    var ignored = false;

    if (lastUsedResponse) {
      ignored = del(lastUsedResponse);
    }

    if (ignored) {
      msg.send(ignoredMessage(lastUsedResponse));
    }
    else {
      msg.send(lastResponseNotFoundMessage());
    }

    lastUsedResponse = null;
  });

  robot.hear(/.*/, function(msg) {
    var text = msg.message.text;

    //TODO existing way to test this somewhere??
    if (!hubotMessageRegex.test(text)) {
      var responses = get(text);

      if (responses.length > 0) {
        var response = randomItem(responses);
        setTimeout(function() { msg.send(responseToString(response) }, 4000);
        lastUsedResponse = response;
        responseUsed(response);
      }
    }
  });
}

module.exports = function(robot) {
  var loaded = _.once(function() {
    console.log('starting hubot-react...');
    start(robot);
  });

  if (_.isEmpty(robot.brain.data) || _.isEmpty(robot.brain.data._private)) {
    robot.brain.once('loaded', loaded);
    setTimeout(loaded, INIT_TIMEOUT);
  }
  else {
    loaded();
  }
};
