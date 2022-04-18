const
  cfg             = require('config'),
  chai            = require('chai'),
  jsonFile        = require('jsonfile'),
  ewelinkApi      = require('ewelink-api'),
  sinon           = require('sinon'),
  EWeLinkDeviceController  = require('../../../../lib/classes/EWeLinkDeviceController.js');

/*
 * Set up chai
 */
chai.should();


// Common testing timeout
var timeout = cfg.timeout || (2*1000);

var basicClassInstantiation = {
  id: "fanController",
  username: "fakePerson",
  password: "fakePassword",
  region: "eu",
  regexMatches: [
    {"pattern" : "^Imaginary Fan Switched on$", "flags": "gi" },
    {"pattern" : "^Porch light Switched off$", "flags": "gi" }
  ]
}

const responseData = jsonFile.readFileSync('./test/data/ewelink/responseSonoff.json')

const elapsedTimeThreshold = 150000
const maxTestTime = 5

/*
 * The actual tests
 */

describe('EWeLinkDeviceController', () => {
  
  describe('getResults', function () {

    this.timeout(timeout)
  
    const b = Object.assign({},basicClassInstantiation)
    
    var getDevicesStub, setDevicePowerStateStub

    /**
     * 
     * @param {Object} params
     * @param {Object} params.opts - initializer for the ewelink object
     * @param {Object} params.eWeLinkResponse - stubbed response from EWeLink
     * @returns {Promise<string[]>} - list of devices with details from EWeLink
     */
    async function getDeviceDetails ({
      opts,
      savedResults = null,
      eWeLinkGetDevicesResponse = responseData,
      eWeLinkSetDevicePowerStateResponse = null,
      turnOffAfterElapsedMilliseconds = elapsedTimeThreshold
    }) {

      getDevicesStub.resolves(eWeLinkGetDevicesResponse)
      if (eWeLinkSetDevicePowerStateResponse) {
        setDevicePowerStateStub.resolves(eWeLinkSetDevicePowerStateResponse)
      } else {
        setDevicePowerStateStub.rejects("Should not reach here")
      }

      const optsWithThreshold = Object.assign({}, opts, {turnOffAfterElapsedMilliseconds})

      const ew = new EWeLinkDeviceController(optsWithThreshold)

      if (savedResults) {
        ew.setSavedData({
          savedData: {
            results: savedResults
          }
        })
      };


      const devices = await ew.getResults(null)
        .catch((e) => {throw e})


      return devices
    }

    const porchLightSavedData = {
      name: "Porch Light Switched off",
      battery: null,
      id: "device1",
      switchStatus: "off",
      online: true,
      lastUpdateTime: 10
    }

    const fanSavedData = {
      name: "Imaginary Fan Switched on",
      battery: null,
      id: "device10",
      switchStatus: "on",
      online: true,
      lastUpdateTime: 10
    }

    const responseDataWithSwitchOnDeviceOnly  = responseData.filter((device) => {return (device.name == "Imaginary Fan Switched on")})
    const responseDataWithSwitchOffDeviceOnly = responseData.filter((device) => {return (device.name == "Porch Light Switched off")})

    /* 
     *   Previous state is unknown
     *      - Save the current state
     * 
     *   Device is off
     *      - Save as being off starting now
     *
     *   Device is on
     *      Below the threshold from previous state
     *         Previous state is known to be off
     *            - Save the current state
     *         Previous state is known to be on
     *            - Save the previous state
     *      Above the threshold from previous state?
     *         - Turn it off
     *         - Save as being off starting now
     *
    */


    function runTest ({
      testDescription,
      deviceSaveTestDesc,
      deviceSaveTest = () => { throw new Error ('Test needed')},
      only = false,
      savedResults = null,
      eWeLinkGetDevicesResponse,
      eWeLinkSetDevicePowerStateResponse = null,
      shouldEWeLinkStateChangeBeCalled = false
    }) {

      descFn = (only)? describe.only : describe;

      descFn(testDescription, async () => {

        const devices = []
        var testStartTime = null
  
        before (async () => {
          getDevicesStub = sinon.stub(ewelinkApi.prototype,"getDevices")
          setDevicePowerStateStub = sinon.stub(ewelinkApi.prototype,"setDevicePowerState")

          testStartTime = (new Date()).getTime()
          const opts = Object.assign({},b)
          const ds = await getDeviceDetails({
            opts,
            savedResults,
            eWeLinkGetDevicesResponse,
            eWeLinkSetDevicePowerStateResponse
          })
          ds.forEach((d) => {devices.push(d)})
        })
    
        after (function () {
          getDevicesStub.reset()
          setDevicePowerStateStub.reset()
          getDevicesStub.restore()
          setDevicePowerStateStub.restore()
        })

        it(deviceSaveTestDesc, () => {
          deviceSaveTest(devices, testStartTime)
        })

        if (shouldEWeLinkStateChangeBeCalled) {
          it(`Attempts to change the device state with eWeLink`, () => {
            setDevicePowerStateStub.called.should.be.true
          })  
        } else {
          it(`Doesn't attempt to change the device state with eWeLink`, () => {
            setDevicePowerStateStub.called.should.not.be.true
          })
        }
      })
    }


    runTest({
      testDescription: `When the previous state is unknown and the device is now on`,
      deviceSaveTestDesc: `Saves the device in its current state`,
      deviceSaveTest: (devices, testStartTime) => { 
        const d = devices[0]
        d.name.should.eql("Imaginary Fan Switched on")
        d.switchStatus.should.eql("on")
        d.lastUpdateTime.should.be.below((testStartTime+maxTestTime))
      },
      eWeLinkGetDevicesResponse: responseDataWithSwitchOnDeviceOnly
    });
    runTest({
      testDescription: `When the previous state is unknown and the device is now off`,
      deviceSaveTestDesc: `Saves the device in its current state`,
      deviceSaveTest: (devices, testStartTime) => { 
        const d = devices[0]
        d.name.should.eql("Porch Light Switched off")
        d.switchStatus.should.eql("off")
        d.lastUpdateTime.should.be.below((testStartTime+maxTestTime))        
      },
      eWeLinkGetDevicesResponse: responseDataWithSwitchOffDeviceOnly
    });

    runTest({
      testDescription: `When the previous state is known and the device is now off`,
      deviceSaveTestDesc: `Saves the device in its current state`,
      savedResults: [porchLightSavedData],
      deviceSaveTest: (devices, testStartTime) => { 
        const d = devices[0]
        d.name.should.eql("Porch Light Switched off")
        d.switchStatus.should.eql("off")
        d.lastUpdateTime.should.be.below((testStartTime+maxTestTime)) 
      },
      eWeLinkGetDevicesResponse: responseDataWithSwitchOffDeviceOnly
    });

    describe('When the device is now on', async () => {

      describe(`When the previous state was off`, async () => {

        const fanIsOffSavedResult = Object.assign({},fanSavedData, {switchStatus: "off"})

        runTest({
          testDescription: `When the fan was previously off but is now on`,
          deviceSaveTestDesc: `Saves the device as being "on" now`,
          savedResults: [fanIsOffSavedResult],
          deviceSaveTest: (devices, testStartTime) => { 
            const d = devices[0]
            d.name.should.eql("Imaginary Fan Switched on")
            d.switchStatus.should.eql("on")
            d.lastUpdateTime.should.be.above(testStartTime-1)
            d.lastUpdateTime.should.be.below((testStartTime+maxTestTime))
          },
          eWeLinkGetDevicesResponse: responseDataWithSwitchOnDeviceOnly
        });
      })

      describe(`When the previous state was on`, async () => {
        const d = new Date()
        const timeNow = d.getTime()
        const tenSecondsAgo = timeNow - 10000

        const fanIsOnAShortWhileAgoSavedResult = Object.assign({}, fanSavedData, {lastUpdateTime: tenSecondsAgo})

        runTest({
          testDescription: `When the device is below the threshold for turning off`,
          deviceSaveTestDesc: `Leaves the previous saved state`,
          savedResults: [fanIsOnAShortWhileAgoSavedResult],
          deviceSaveTest: (devices, testStartTime) => {
            const d = devices[0]
            d.name.should.eql("Imaginary Fan Switched on")
            d.switchStatus.should.eql("on")
            d.lastUpdateTime.should.eql(tenSecondsAgo)
          },
          eWeLinkGetDevicesResponse: responseDataWithSwitchOnDeviceOnly
        });

        const tenHoursAgo = timeNow - (1000 * 10 * 60 * 60)
        const fanIsOnTenHoursAgoSavedResult = Object.assign({}, fanSavedData, {lastUpdateTime: tenHoursAgo})
        runTest({
          testDescription: `When the device is above the threshold for turning off`,
          deviceSaveTestDesc: `Turns the device off and records the off state`,
          savedResults: [fanIsOnTenHoursAgoSavedResult],
          shouldEWeLinkStateChangeBeCalled: true,
          deviceSaveTest: (devices, testStartTime) => {
            const d = devices[0]
            d.name.should.eql("Imaginary Fan Switched on")
            d.switchStatus.should.eql("off")
            d.lastUpdateTime.should.be.at.least(testStartTime)
          },
          eWeLinkGetDevicesResponse: responseDataWithSwitchOnDeviceOnly,
          eWeLinkSetDevicePowerStateResponse: {status: "off"}
        });

      })

    })

  
  })
  

  describe('getResultsString', function () {
  
    this.timeout(timeout)
    
    const tests = [{
      testDesc: 'returns a string for no results',
      results: [],
      expectedResponse: ""
    },{
      testDesc: 'returns a string for one result',
      results: [
        {
          name: "Device low battery and not online and switch on",
          battery: 0.5,
          id: "d1",
          switchStatus: "on",
          online: false,
          lastUpdate: "2020-08-17T23:46:05.895Z"
        }
      ],
      expectedResponse: ""

    },{
      testDesc: 'returns a string for many results',
      results: [
        {
          name: "Device low battery and not online and switch on",
          battery: 0.5,
          id: "d1",
          switchStatus: "on",
          online: false,
          lastUpdate: "2020-08-17T23:46:05.895Z"
        },{
          name: "Device high battery and online and switch on",
          battery: 2.5,
          id: "d2",
          switchStatus: "on",
          online: true,
          lastUpdate: "2020-08-17T23:46:05.895Z"
        },{
          name: "Device high battery and not online and switch off",
          battery: 1.5,
          id: "d3",
          switchStatus: "off",
          online: false,
          lastUpdate: "2020-08-17T23:46:05.895Z"
        }
      ],
      expectedResponse: ""
    }]
  
    tests.forEach( ({
      testDesc,
      only = false,
      results,
      expectedResponse
    }) => {
  
      const itFn = (only)? it.only : it;
  
      itFn(testDesc, () => {
  
        const init = Object.assign({},basicClassInstantiation)
  
        const eWeLinkTrawler = new EWeLinkDeviceController(init)
        eWeLinkTrawler.results = results

        const resultsString = eWeLinkTrawler.getResultsString()
        resultsString.should.eql(expectedResponse)
        
      });
  
    })
  
  
  
  })
})