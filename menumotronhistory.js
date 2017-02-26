var AWS = require('aws-sdk');
var s3 = new AWS.S3();

var bucketName = 'menumotron.nparry.com';

function fetchMenuContent(key, menus, expectedSize, callback) {
  s3.getObject({
    Bucket: bucketName,
    Key: key
  }, function(err, data) {
    if (err) {
      console.log("Failed to fetch menu from " + key);
      console.log(err, err.stack);
    } else {
      console.log("Fetched menu from key " + key);
      menus[key.split('/')[1]] = data.Body.utf8Slice();
      if (Object.keys(menus).length == expectedSize) {
        callback();
      }
    }
  });
}

function buildHistoricalMenu(accumulator) {
  var menus = {};
  function saveMenus() {
    var dates = Object.keys(menus).sort().reverse();
    var parts = [];
    for (var i = 0; i < dates.length; i++) {
      var header = "Menu for " + dates[i];
      var menu = [ header, '-'.repeat(header.length), menus[dates[i]] ].join('\n');
      parts.push(menu);
    }

    s3.putObject({
      Bucket: bucketName,
      Key: 'menu.log',
      ContentType: 'text/plain',
      Body: parts.join("\n\n")
    }, function(err, data) {
      if (err) {
        console.log("Failed to save historical menu");
        console.log(err, err.stack);
      } else {
        console.log("Saved historical menu");
      }
    });
  };

  for (var i = 0; i < accumulator.length; i++) {
    var key = accumulator[i].Key;
    fetchMenuContent(key, menus, accumulator.length, saveMenus);
  }
}

function buildCallback(accumulator) {
  return function(r) {
    accumulator = accumulator.concat(r.data.Contents);

    if(r.hasNextPage()) {
      r.nextPage().on('success', buildCallback(accumulator)).send();
    } else {
      buildHistoricalMenu(accumulator);
    }
  };
}

exports.handler = function(event, context, callback) {
  s3.listObjectsV2({
    Bucket: bucketName,
    Prefix:'menus/'
  }).on(
    'success',
    buildCallback([])
  ).on('error', function(r) {
    console.log('Unable to list bucket contents');
  }).send();
};
