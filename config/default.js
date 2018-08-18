var cfg   = require('config');
var defer = require('config/defer').deferConfig;

module.exports = {

  appName: "siteTrawler",

  auth: {
    credentialsDir:   process.env.HOME+'/.credentials',
    clientSecretFile: defer( function (cfg) { return cfg.auth.credentialsDir+'/client_secret.json' } ),
    tokenFileDir:     defer( function (cfg) { return cfg.auth.credentialsDir } ),
    tokenFile:        defer( function (cfg) { return 'access_token_'+cfg.appName+ '-' + process.env.NODE_ENV+'.json' } ),
    googleScopes:     ['https://mail.google.com']
  },


  log: {
    appName: defer(function (cfg) { return cfg.appName } ),
    level:   "INFO",
    log4jsConfigs: {
      appenders: [
        {
          type:       "file",
          filename:   defer(function (cfg) { return cfg.log.logDir.concat("/" , cfg.appName, "-", process.env.NODE_ENV, ".log" ) }),
          category:   defer(function (cfg) { return cfg.log.appName }),
          reloadSecs: 60,
          maxLogSize: 1024000
        },
        {
          type: "console"
        }
      ],
      replaceConsole: true
    },
    logDir: "./logs"
  },

  maxResults: 10,

  reporter: {
    appName             : defer( function (cfg) { return cfg.appName } ),
    appSpecificPassword : "OVERRIDE_ME",
    emailsFrom          : "OVERRIDE_ME",
    name                : "Reporter (Personal)",
    notificationTo      : "OVERRIDE_ME",
    user                : "OVERRIDE_ME",
    clientSecretFile    : "",
    googleScopes        : "",
    tokenDir            : "",
    tokenFile           : ""
  },

  savedDataFile: defer(function (cfg) {
    var file = '.data/savedData'
    if (process.env.NODE_APP_INSTANCE) { file += '-' + process.env.NODE_APP_INSTANCE }
    if (process.env.NODE_ENV)          { file += '-' + process.env.NODE_ENV }
    file += '.json'
    return file
  }),

  twitter : {
    consumerKey       : "OVERRIDE_ME",
    consumerSecret    : "OVERRIDE_ME",
    accessToken       : "OVERRIDE_ME",
    accessTokenSecret : "OVERRIDE_ME",
  }
}
