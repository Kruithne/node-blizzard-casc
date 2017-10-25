const CASC = require('./blizzard-casc');
const assert = require('assert');
const casc = new CASC();

(async () => {
	// Test product specification.
	assert.throws(() => { casc.targetProduct; }, Error, 'casc.targetProduct expected to throw error when accessed before before set.');
	casc.setTargetProduct(CASC.PRODUCT_WOW);
	assert.equal(CASC.PRODUCT_WOW, casc.targetProduct, 'casc.targetProduct != CASC.PRODUCT_WOW after being set.');

	// Test patch server URL.
	assert.equal(CASC.PATCH_SERVER_US, casc.patchServer);
	casc.setPatchServer(CASC.PATCH_SERVER_EU);
	assert.equal(CASC.PATCH_SERVER_EU, casc.patchServer);

	// Test and validate CDN list structure.
	let expectedProps = ['Name', 'Path', 'Hosts', 'ConfigPath'];
	let cdnList = await casc.downloadCDNList();
	assert(Array.isArray(cdnList), 'Array expected from casc.downloadCDNList()');
	assert(cdnList.length > 0, 'casc.downloadCDNList() returned an empty array.');
	for (let cdn of cdnList)
		for (let prop of expectedProps)
			assert(cdn.hasOwnProperty(prop), 'casc.downloadCDNList() entry missing property: ' + prop);

	// Test and validate version list structure.
	let versionList = await casc.downloadVersionList();
	expectedProps = ['Region', 'BuildConfig', 'CDNConfig', 'KeyRing', 'BuildId', 'VersionsName', 'ProductConfig'];
	assert(Array.isArray(versionList), 'Array expected from casc.downloadVersionList()');
	assert(versionList.length > 0, 'casc.downloadVersionList() returned an empty array.');
	for (let version of versionList)
		for (let prop of expectedProps)
			assert(version.hasOwnProperty(prop), 'casc.downloadVersionList() entry missing property: ' + prop);

	let selectedCdn = cdnList[0]; // Naive blind pick, all should work for test.
	let selectedHost = selectedCdn.Hosts.split(' ')[0]; // Naively pick CDN host too.

	// Test data server URL.
	assert.throws(() => { casc.cdnServer }, Error, 'casc.cdnServer expected to throw error when accessed before set.');
	assert.throws(() => { casc.cdnPath }, Error, 'casc.cdnPath expected to throw error when accessed before set.');
	casc.setCDNServer(selectedHost, selectedCdn.Path);
	assert(casc.cdnServer.startsWith('http://'));

	// Find the build for the CDN region we picked.
	let selectedVersion;
	for (let version of versionList) {
		if (version.Region === selectedCdn.Name) {
			selectedVersion = version;
			break;
		}
	}

	if (!selectedVersion)
		throw new Error('Version list did not contain match for CDN region: ' + selectedCdn.Name);

	let cdnConfig = await casc.downloadConfigFile(selectedVersion.CDNConfig);
	assert(cdnConfig.hasOwnProperty('archives'), 'Unable to verify cdnConfig, `archives` property missing.');

	let buildConfig = await casc.downloadConfigFile(selectedVersion.BuildConfig);
	assert(buildConfig.hasOwnProperty('root'), 'Unable to verify buildConfig, `root` property missing.');

	// Attempt to download at least one archive.
	let archiveKey = cdnConfig.archives[0];
	await casc.parseIndexFile(archiveKey);

	// Attempt to download/parse encoding table.
	let encodingKey = buildConfig.encoding[1];
	let encoding = await casc.parseEncodingFile(encodingKey);
})();