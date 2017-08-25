var AWS = require('aws-sdk');
var s3 = new AWS.S3();

var bucketName = 'menumotron.nparry.com';

function addDays(date, days) {
  var result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function normalizeMenu(dailyMenu) {
  var lines = dailyMenu.split('\n');
  var result = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (line.length == 0) continue;

    // If we've hit the closing lines, stop building the menu
    if (line.match(/\b(sara|joan|marianne|week)\b/i)) break;

    // If this is the typical "Salad" line, add some padding
    if (line.indexOf(' ') == -1 && result.length != 0) result.push('');

    result.push(line);
  }

  return result.join('\n');
}

function saveDailyMenu(office, dailyMenuName, dailyMenu, callback) {
  s3.putObject({
    Bucket: bucketName,
    Key: 'menus/' + office + '/' + dailyMenuName,
    Body: dailyMenu
  }, function(err, data) {
    if (err) {
      console.log("Failed to save daily menu " + dailyMenuName);
      console.log(err, err.stack);
      callback(dailyMenuName);
    } else {
      console.log("Saved daily menu " + dailyMenuName);
      callback(null);
    }
  });
}

function recordProcessMarker(office, errors, baseDate, callback) {
  s3.putObject({
    Bucket: bucketName,
    Key: 'menus/lastUpdated.marker',
    Body: "Updated " + office + " menus with " + errors.length + " errors at " + (new Date()).toString()
  }, function(err, data) {
    if (err) {
      console.log("Failed to update lastUpdated marker");
      console.log(err, err.stack);
    } else {
      console.log("Update lastUpdated marker");
    }
    callback(errors.length == 0 ? null : errors.length, baseDate);
  });
}

function processMenu(office, baseDate, buffer, callback) {
  var data = buffer.utf8Slice();
  var parts = data.split(/\n\s*(?:Monday|Tuesday|Wednesday|Thursday|Friday)[^\r\n]*/i);
  console.log('Split menu into ' + parts.length + ' parts');

  var results = [];
  for (var i = 1; i < 6; i++) {
    console.log('Processing menu piece ' + i);
    var date = addDays(baseDate, i - 1);
    saveDailyMenu(office, date.toISOString().split('T')[0], normalizeMenu(parts[i]), function(result) {
      results.push(result);
      if (results.length == 5) {
        var errors = results.filter(function(r) { return r != null; });
        recordProcessMarker(office, errors, baseDate, callback);
      }
    });
  }
}

exports.handler = function(event, context, callback) {
  var key = event.Records[0].s3.object.key;
  console.log("Triggered to process key " + key);
  if (!key.match(/menumessages\/(Columbus|Cleveland)\/\d\d\d\d-\d\d-\d\d/)) return;
  var menuOffice = key.split('/')[1];
  var menuName = key.split('/')[2];
  console.log("Will attempt to process menu " + menuName + " for office " + menuOffice);

  s3.getObject({
    Bucket: bucketName,
    Key: key
  }, function(err, data) {
    if (err) {
      console.log("Failed to fetch " + menuName);
      console.log(err, err.stack);
      callback(key, 'Failed');
    } else {
      console.log("Processing " + menuName);
      processMenu(menuOffice, new Date(menuName), data.Body, callback);
    }
  });
};

