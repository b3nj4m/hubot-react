// Description:
//   Train hubot to react to certain terms.
//
// Dependencies:
//   "underscore": "~1.7.0"
//   "natural": "~0.1.28"
//   "moment": "~2.8.3"
//
// Configuration:
//   HUBOT_REACT_STORE_SIZE=N - Remember at most N messages (default 200).
//   HUBOT_REACT_THROTTLE_EXPIRATION=N - Throttle responses to the same terms for N seconds (default 300).
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

var stemmer = natural.PorterStemmer;
var ngrams = natural.NGrams.ngrams;

var STORE_SIZE = process.env.HUBOT_REACT_STORE_SIZE ? parseInt(process.env.HUBOT_REACT_STORE_SIZE) : 200;
var THROTTLE_EXPIRATION = process.env.HUBOT_REACT_THROTTLE_EXPIRATION ? parseInt(process.env.HUBOT_REACT_THROTTLE_EXPIRATION) : 300;

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
  var stems = stemmer.tokenizeAndStem(text);
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
  var stems = stemmer.tokenizeAndStem(term);
  var stemsString = stems.join(',');
  var messageStore = retrieve('reactMessageStore');
  var termSizes = retrieve('reactTermSizes');

  ensureStoreSize(messageStore, termSizes, STORE_SIZE - 1);

  messageStore[stemsString] = messageStore[stemsString] || {};

  messageStore[stemsString][response] = {
    term: term,
    stems: stems,
    stemsString: stemsString,
    response: response
  };

  //keep track of number of words in each term so we know what sizes of ngrams to generate
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

  responseUsageTimes[response.stemsString] = moment.utc().toISOString();

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
  try {
    string = JSON.stringify(data);
  }
  catch (err) {
    //emit error?
  }

  return string;
}

function deserialize(string) {
  try {
    data = JSON.parse(string);
  }
  catch (err) {
    //emit error?
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
  if (!messageStore) {
    messageStore = {};
  }

  var termSizes = retrieve('reactTermSizes');
  if (!termSizes) {
    termSizes = computeTermSizes(messageStore);
  }

  ensureStoreSize(messageStore, termSizes, STORE_SIZE);

  store('reactMessageStore', messageStore);
  store('reactTermSizes', termSizes);

  var hubotMessageRegex = new RegExp('^[@]?' + robot.name + '[:,]?\\s', 'i');

  robot.respond(/react ((\w*)|"(((\s*)?\w)*)") (.*)/i, function(msg) {
    var term = msg.match[2] || msg.match[3];
    var response = msg.match[6];

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
        msg.send(responseToString(response));
        lastUsedResponse = response;
        responseUsed(response);
      }
    }
  });
}

module.exports = function(robot) {
  var loaded = function() {
    start(robot);
  };

  if (_.isEmpty(robot.brain.data) || _.isEmpty(robot.brain.data._private)) {
    robot.brain.once('loaded', loaded);
  }
  else {
    loaded();
  }
};
