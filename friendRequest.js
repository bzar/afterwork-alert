const UntappdClient = require("node-untappd");

const clientId = [ config.clientId ];
const clientSecret = [ config.clientSecret ];
const accessToken = [ config.accessToken ];

// Set to true if you want to see all sort of nasty output on stdout.
var debug = false;
if ((process.argv.length > 2 && process.argv[2] == 'debug') || (process.env.mode === 'dev')) {
  debug = true;
}

// Create Untappd Client
var untappd = new UntappdClient(debug);
untappd.setClientId(clientId);
untappd.setClientSecret(clientSecret);
untappd.setAccessToken(accessToken); // TODO add accessToken adding LATER get accessToken

// Create friend request from untappd
var createFriendRequest = function (user) {
  log("create friend request for ", message.text.split(' ')[1]);
  untappd.userInfo(function(err, obj){
    log(obj.response.user);

    untappd.requestFriends(function (err, obj) {
      log(obj);
    }, {'TARGET_ID': obj.response.user.uid });

  }, {"USERNAME" : user});
};

function log(...args) {
  // could add here some real logging to file etc.
  args.map((arg) => console.log(arg));
}

exports.handler(event, context, callback) => {
  // parse user from event
  createFriendRequest("ozqu");
};
