var cfg   = require('config');
var defer = require('config/defer').deferConfig;

module.exports = {

  auth: {
    tokenFile: defer( function (cfg) { return 'access_token_'+cfg.appName+ '-test-recipient.json' } ),
  },

  log : {
    level: "INFO",
    log4jsConfigs: {
      replaceConsole: false
    }
  },

  connectionTimeout: 5000,

  maxResults: 5,

  trawlers: [{

    trawlModel: "twitter",
    setup: {
      id: "@SecretFlying-Twitter",
      maxResults: 5,
      twitterId: "SecretFlying",
      tweetMatches: [{
        pattern : "roundtrip", flags: "gi" },{
        pattern : "video",     flags: "gi" }

      ]
    }}, {

    trawlModel: "twitter",
    setup: {
      id: "@HolidayPirates-Twitter",
      maxResults: 5,
      twitterId: "HolidayPirates",
      tweetMatches: [{
        pattern : "quarter price", flags: "gi" },{
        pattern : "half price",    flags: "gi" }
      ]
    }}
  ],

  testEmailSender: {
    gmail: {
      appSpecificPassword : process.env.PERSONAL_APP_SPECIFIC_PASSWORD,
      clientSecretFile    : defer ( function (cfg) { return cfg.auth.clientSecretFile } ),
      emailsFrom          : defer ( function (cfg) { return cfg.appName + " notification sender" } ),
      googleScopes        : defer ( function (cfg) { return cfg.auth.googleScopes } ),
      name                : 'Report sender',
      tokenDir            : defer ( function (cfg) { return cfg.auth.tokenFileDir } ),
      tokenFile           : defer ( function (cfg) { return cfg.auth.tokenFile.replace('-recipient','-sender')} ),
      user                : process.env.PERSONAL_GMAIL_USERNAME
    }
  },

  testEmailRecipient: {
    emailAddress: process.env.PERSONAL_TEST_EMAIL,
    subject: defer ( function (cfg) { return cfg.appName + '-test Report' } ),
    gmail: {
      clientSecretFile : defer ( function (cfg) { return cfg.auth.clientSecretFile } ),
      googleScopes     : defer ( function (cfg) { return cfg.auth.googleScopes } ),
      name             : 'Recipient inbox',
      tokenDir         : defer ( function (cfg) { return cfg.auth.tokenFileDir } ),
      tokenFile        : defer ( function (cfg) { return cfg.auth.tokenFile } )
    }
  },

  reporter: {
    appName             : defer( function (cfg) { return cfg.appName+'-'+process.env.NODE_ENV } ),
    appSpecificPassword : process.env.PERSONAL_APP_SPECIFIC_PASSWORD,
    emailsFrom          : process.env.PERSONAL_EMAIL_ADDRESS,
    name                : 'Reporter (Personal)',
    notificationTo      : defer( function (cfg) { return cfg.testEmailSender.recipient } ),
    user                : process.env.PERSONAL_GMAIL_USERNAME
  }
}
