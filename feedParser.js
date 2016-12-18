const UntappdClient = require("node-untappd");
const Slack = require('slack-node');
const _ = require('lodash');
const moment = require('moment');

const clientId = [ config.clientId ];
const clientSecret = [ config.clientSecret ];
const accessToken = [ config.accessToken ];
const whatIsCountedAsAfterWork = config.whatIsCountedAsAfterWork;
const whatIsCountedAfterPrevious = config.whatIsCountedAfterPrevious;
const lookupuser = config.lookupuser;
const channels = config.channels;
const botname = config.botname;
const timeFormat = 'ddd, DD MMM YYYY HH:mm:ss +0000';
var usedCids = [];

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
// Create Slack Client
var slack = new Slack(config.slackApiToken);

function getUntappdFeed() {
  return new Promise((resolve, reject) => {
    untappd.activityFeed(function (err, obj) {
      log(obj, err);
      var afterwork = [];
      // Check what counts is really | either this or items.size etc
      if (obj && obj.response && obj.response.checkins.count > 0) {
        var items = obj.response.checkins.items;
        for (var item of items) {
          afterwork.push({
            'cid': item.checkin_id,
            'time': item.created_at,
            'vid': item.venue !== undefined ? item.venue.venue_id : undefined,
            'vname': item.venue !== undefined ? item.venue.venue_name : undefined,
            'city': item.venue !== undefined && item.venue.location !== undefined ? item.venue.location.venue_city : undefined,
            'uid': item.user.uid,
            'name': item.user.first_name + ' ' + item.user.last_name
          });
        }
        return resolve(afterwork);
      }
    })
  });
}

function parseAfterworkers(feed) {
  log("feed: ", feed, "end of feed");
  return new Promise((resolve, reject) => {
    // subtract twice to get afterworks between loops
    var earliest_allowed_checkin = moment().utc()
      .subtract({days: 2})
      .subtract(whatIsCountedAsAfterWork)
      .subtract(whatIsCountedAsAfterWork);
    log("earliest: " + earliest_allowed_checkin.toString());
    afterwork = _.chain(feed)
      .sortBy((checkin) => moment(checkin.time, timeFormat))
      .filter((checkin) => {
        log(checkin.name + ": " + moment(checkin.time, timeFormat).utc().toString());
        return moment(checkin.time, timeFormat).utc().isAfter(earliest_allowed_checkin) // Not too long time ago
          && (!usedCids.includes(checkin.cid)) // checkin id not used to another aw before
          && (checkin.vid); // has to have venue
      })
      // Group by venue
      .groupBy((checkin) => checkin.vid)
      .values()
      .map(function (checkInsInOneVenue) { // Do this for all users grouped by venue
        return checkInsInOneVenue.reduce((a, b) => {
          if(a.length === 0) { // as first
            a.push(b);
            return a;
          }
          var isAW = isCountedInAW(a, b);
          if(a.length === 1 && !isAW) { // if not with first, change this to first
            a.pop();
            a.push(b);
            return a;
          }
          if(a.length > 0 && isAW) { // if aw with previous, add
            a.push(b);
          }
          return a;
        }, []);
      })
      // Has to have more than one user in same venue
      .filter((elem) => {
        return elem.length > 1;
      })
      .value();
    log("parsed afterworkers: ", afterwork, "end of parsed afterworkers");
    // Add afterwork content to used cids
    afterwork.map((checkinGroups) => {
      checkinGroups.map((checkin) => {
        usedCids.push(checkin.cid);
      });
    });
    resolve(afterwork);
  });
}

// a: list of current checkins which are having AW
// b: checkin to be tested against a
function isCountedInAW(a, b) {
  var min = moment(a[0].time, timeFormat); // First one's checkin time
  var max = a.length < 2
    ? moment(min).add(whatIsCountedAsAfterWork) // First one + maxTime
    : moment(a[a.length - 1].time, timeFormat).add(whatIsCountedAfterPrevious); // Previous added + maxTimeAfterPrevious
  var current = moment(b.time, timeFormat);
  if (current.isBetween(min, max)
    && (a.find((checkin) => { return checkin.uid === b.uid }) === undefined)) {
    return true;
  }
  return false;
}

function buildPayloads(afterwork) {
  return new Promise((resolve, reject) => {
    // for every venue, send message
    var payloads = [];
    for (let venue of afterwork) {
      // build persons string
      var persons = "";
      for (let checkin of venue) {
        persons += checkin.name + ' ';
      }
      persons = persons.slice(0, -1);
      // build payload
      var payload = {
        'text': venue.length + ' henkilöä afterworkilla ravintolassa ' + venue[0].vname + ' (' + persons + ')',
        'channel': channels[venue[0].city],
        'username': botname
      }
      payloads.push(payload);
    }
    resolve(payloads);
  });
}

exports.handler = (event, context, callback) => {
  getUntappdFeed()
    .then(parseAfterworkers)
    .then(buildPayloads)
    .then((resove, reject) => {
      log("resolve: ", payload);
    })
    .catch((reason) => log("reason: " , reason));
}
