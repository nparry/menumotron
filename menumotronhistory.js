var AWS = require('aws-sdk');
var s3 = new AWS.S3();

var bucketName = 'menumotron.nparry.com';

function fetchMenuContent(key, menus, expectedSize, callback, toplevelCallback) {
  s3.getObject({
    Bucket: bucketName,
    Key: key
  }, function(err, data) {
    if (err) {
      console.log("Failed to fetch menu from " + key);
      console.log(err, err.stack);
      toplevelCallback(key, 'Failed');
    } else {
      console.log("Fetched menu from key " + key);
      menus[key.split('/')[2]] = data.Body.utf8Slice();
      if (Object.keys(menus).length == expectedSize) {
        callback();
      }
    }
  });
}

function getDayName(date) {
  return [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ][new Date(date).getDay()];
}

function buildHistoricalMenu(accumulator, office, callback) {
  var objectName = 'menu.' + office + '.log';
  var menus = {};
  function saveMenus() {
    console.log('Saving historical menu for ' + office);
    var objectName = 'menu.' + office + '.log';
    var dates = Object.keys(menus).sort().reverse();
    var parts = [];
    for (var i = 0; i < dates.length; i++) {
      var header = "Menu for " + getDayName(dates[i]) + ", " + dates[i];
      var menu = [ header, '-'.repeat(header.length), menus[dates[i]] ].join('\n');
      parts.push(menu);
    }


    s3.putObject({
      Bucket: bucketName,
      Key: objectName,
      ContentType: 'text/plain',
      Body: parts.join("\n\n")
    }, function(err, data) {
      if (err) {
        console.log("Failed to save historical menu for " + office);
        console.log(err, err.stack);
        callback(objectName, 'Failed');
      } else {
        console.log("Saved historical menu for " + office);
        callback(null, objectName);
      }
    });
  };

  for (var i = 0; i < accumulator.length; i++) {
    var key = accumulator[i].Key;
    fetchMenuContent(key, menus, accumulator.length, saveMenus, callback);
  }
}

function accumulateMenuNames(accumulator, office, callback) {
  return function(r) {
    accumulator = accumulator.concat(r.data.Contents);

    if(r.hasNextPage()) {
      console.log('Fetching next page of menu names for ' + office);
      r.nextPage().on('success', accumulateMenuNames(accumulator, office, callback)).send();
    } else {
      console.log('Fetched ' + accumulator.length + ' menu names for ' + office);
      buildHistoricalMenu(accumulator, office, callback);
    }
  };
}

function buildHistoricalMenuForOffice(office, callback) {
  console.log('Fetching menu names for ' + office);
  s3.listObjectsV2({
    Bucket: bucketName,
    Prefix:'menus/' + office
  }).on(
    'success',
    accumulateMenuNames([], office, callback)
  ).on('error', function(r) {
    console.log('Unable to list bucket contents');
    callback(bucketName + '/' + office, "Failed");
  }).send();
}

exports.handler = function(event, context, callback) {
  var offices = [ '41SouthHigh', '2Miranova', 'Cleveland' ];

  var results = [];
  function handlerCallback(err, result) {
    console.log("Got top level result " + err + " " + result);
    results.push(result);
    if (results.length == offices.length) {
      callback(null, offices.length);
    }
  }

  for (var i = 0; i < offices.length; i++) {
    buildHistoricalMenuForOffice(offices[i], handlerCallback);
  }
};

