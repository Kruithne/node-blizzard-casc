/*!
	blizzard-casc (https://github.com/Kruithne/node-blizzard-casc)
	Author: Kruithne <kruithne@gmail.com>
	License: MIT
 */

const request = require('request-promise-native');
const BLTEReader = require('node-blte');
const Bufo = require('bufo');
const bytey = require('bytey');
const util = require('util');

const LocaleFlag = {
	All: 0xFFFFFFFF,
	None: 0,
	enUS: 0x2,
	koKR: 0x4,
	frFR: 0x10,
	deDE: 0x20,
	zhCN: 0x40,
	esES: 0x80,
	zhTW: 0x100,
	enGB: 0x200,
	enCH: 0x400,
	enTW: 0x800,
	esMX: 0x1000,
	ruRU: 0x2000,
	ptBR: 0x4000,
	itIT: 0x8000,
	ptPT: 0x10000,
	enSG: 0x20000000,
	plPL: 0x40000000,
	All_WoW: 0x1F3F6
};

const ContentFlag = {
	None: 0,
	F00000001: 0x1,
	F00000002: 0x2,
	F00000004: 0x4,
	F00000008: 0x8,
	F00000010: 0x10,
	LowViolence: 0x80,
	F10000000: 0x10000000,
	F20000000: 0x20000000,
	Bundle: 0x40000000,
	NoCompression: 0x80000000
};

class CASC {
	/**
	 * Get the target product. Throws an error if not set.
	 * @returns {string}
	 */
	get targetProduct() {
		if (!this._productTag)
			throw new Error('No target product. Set with setTargetProduct().');

		return this._productTag;
	}

	/**
	 * Get the URL for the patch server. Defaults to `CASC.PATCH_SERVER_US` if not set.
	 * @returns {string}
	 */
	get patchServer() {
		return this._patchServer || CASC.PATCH_SERVER_US;
	}

	/**
	 * Get the URL of the CDN server. Throws an error if not set.
	 * @returns {string|*}
	 */
	get cdnServer() {
		if (!this._cdnServer)
			throw new Error('No CDN server specified. Set with setCDNServer().');

		return this._cdnServer;
	}

	get cdnPath() {
		if (!this._cdnPath)
			throw new Error('No CDN path specified. Set with setCDNServer().');

		return this._cdnPath;
	}

	/**
	 * Set the URL of the patch server to be used for obtaining config.
	 * This can be a custom URL or one of the pre-defined `PATCH_SERVER_*` constants provided by the `CASC` class.
	 * @param {string} url Expected format: http://hostname:port
	 */
	setPatchServer(url) {
		// Remove trailing slashes from the provided URL.
		if (url.endsWith('/'))
			url = url.substring(0, url.length - 1);

		this._patchServer = url;
	}

	/**
	 * Set the CDN server host to be used for obtaining data.
	 * For most purposes, this hostname should be obtained using `downloadCDNList()`.
	 * @param {string} host Hostname (e.g `edgecast.blizzard.com`).
	 * @param {string} path CDN path (e.g `tpr/wow`).
	 */
	setCDNServer(host, path) {
		if (!host.startsWith('http')) host = 'http://' + host;
		if (host.endsWith('/')) host = host.substring(0, host.length - 1);
		if (path.startsWith('/')) path = path.substring(1, path.length);
		if (path.endsWith('/')) path = path.substring(0, path.length - 1);

		this._cdnServer = host;
		this._cdnPath = path;
	}

	/**
	 * Set the target product to obtain data for.
	 * Use the `PRODUCT_*` constants provided by the `CASC` class.
	 * @param {string} tag Product tag (e.g `wow_beta`).
	 */
	setTargetProduct(tag) {
		this._productTag = tag;
	}

	/**
	 * Download the CDN list from the patch server.
	 * @returns {Promise.<Array>}
	 */
	async downloadCDNList() {
		return CASC._processVersionConfig(await this._downloadPatchFile('cdns'));
	}

	/**
	 * Download the build version list from the patch server.
	 * @returns {Promise.<Array>}
	 */
	async downloadVersionList() {
		return CASC._processVersionConfig(await this._downloadPatchFile('versions'));
	}

	/**
	 * Download a config file from the CDN server.
	 * @param {string} key Key of the config file to download.
	 * @returns {Promise.<object>}
	 */
	async downloadConfigFile(key) {
		return CASC._processCDNConfig(await request(this._formatConfigURL(key), { encoding: 'utf8' }));
	}

	/**
	 * Download an index file from the CDN server.
	 * @param key Key of the index file to download.
	 * @returns {Promise.<Bufo>}
	 */
	async downloadIndexFile(key) {
		return new Bufo(await request(this._formatIndexURL(key), { encoding: null }));
	}

	/**
	 * Download a data file from the CDN server.
	 * @param {string} key Key of the data file to download.
	 * @returns {Promise.<Bufo>}
	 */
	async downloadDataFile(key) {
		return new Bufo(await request(this._formatDataURL(key), { encoding: null }));
	}

	/**
	 * Parse an index file and return the entries from it.
	 * @param {Buffer|Bufo|string} archive Archive to parse.
	 * @returns {Promise.<Array>}
	 */
	async parseIndexFile(archive) {
		let entries = [];

		if (typeof archive === 'string')
			archive = await this.downloadIndexFile(archive);
		else
			archive = new Bufo(archive);

		// Create new array if reference not given.
		if (!Array.isArray(entries))
			entries = [];

		archive.seek(-12);
		let count = archive.readInt32();

		archive.seek(0);

		if (count * 24 > archive.byteLength)
			throw new Error('Unable to parse archive, unexpected size.');

		// Iterate all entries in the archive.
		for (let j = 0; j < count; j++) {
			let hash = archive.readUInt8(16);

			entries.push({
				Hash: bytey.byteArrayToHexString(hash),
				Size: archive.readInt32(1, Bufo.ENDIAN_BIG),
				Offset: archive.readInt32(1, Bufo.ENDIAN_BIG)
			});
		}

		return entries;
	}

	/**
	 * Parse an encoding file and return all entries.
	 * @param {BLTEReader|string} encoding Encoding file or key.
	 * @returns {Promise.<Array>}
	 */
	async parseEncodingFile(encoding) {
		let entries = [];

		// Download encoding file if provided with a key.
		if (typeof encoding === 'string')
			encoding = new BLTEReader(await this.downloadDataFile(encoding), encoding);

		encoding.seek(9);
		let numEntriesA = encoding.readInt32(1, Bufo.ENDIAN_BIG);
		encoding.move(5);

		let stringBlockSize = encoding.readInt32(1, Bufo.ENDIAN_BIG);
		encoding.move(stringBlockSize); // Skip string block.
		encoding.move(numEntriesA * 32); // Skip entries.

		let chunkStart = encoding.offset;

		for (let i = 0; i < numEntriesA; i++) {
			let keysCount = encoding.readUInt16();

			while (keysCount !== 0) {
				let fileSize = encoding.readUInt32(1, Bufo.ENDIAN_BIG);
				let hash = bytey.byteArrayToHexString(encoding.readUInt8(16));
				let entryKey;

				for (let j = 0; j < keysCount; j++) {
					let key = bytey.byteArrayToHexString(encoding.readUInt8(16));

					if (j === 0)
						entryKey = key;
				}

				entries.push({ Hash: hash, Key: entryKey, Size: fileSize });
				keysCount = encoding.readUInt16();
			}

			let remainingBytes = 4096 - ((encoding.offset - chunkStart) % 4096);
			if (remainingBytes > 0)
				encoding.move(remainingBytes);
		}

		return entries;
	}

	/**
	 * Parse a root file, returning all entries with indexed flag pairs.
	 * @param {BLTEReader|string} root Root file or key.
	 * @returns {Promise.<{Entries: Array, Types: Array}>}
	 */
	async parseRootFile(root) {
		let entries = [], types = [];

		// Download root file if provided with a key.
		if (typeof root === 'string')
			root = new BLTEReader(await this.downloadDataFile(root), root);

		root.seek(0); // Reset reader.

		let rootIndex = {}, typeIndex = 0;
		while (root.offset < root.byteLength) {
			let count = root.readInt32();

			let contentFlag = root.readUInt32();
			let localeFlag = root.readUInt32();

			if (localeFlag === CASC.LOCALE_FLAG.None)
				throw new Error('Root: No locale specified.');

			if (contentFlag !== CASC.CONTENT_FLAG.None && (contentFlag & (CASC.CONTENT_FLAG.F00000008 | CASC.CONTENT_FLAG.F00000010 | CASC.CONTENT_FLAG.NoCompression | CASC.CONTENT_FLAG.F20000000) === 0))
				throw new Error('Root: Invalid content flag set (%d)', contentFlag);

			typeIndex++;
			types[typeIndex] = { LocaleFlag: localeFlag, ContentFlag: contentFlag };

			let entries = [];
			let fileDataIndex = 0;
			for (let i = 0; i < count; i++) {
				let nextID = fileDataIndex + root.readInt32();

				entries[i] = {
					RootType: typeIndex,
					FileDataID: nextID
				};

				fileDataIndex = nextID + 1;
			}

			for (let i = 0; i < count; i++) {
				let key = bytey.byteArrayToHexString(root.readUInt8(16));
				let hash = bytey.byteArrayToHexString(root.readUInt8(8));

				let entry = entries[i];

				let hashCheck = rootIndex[entry.FileDataID];
				if (hashCheck !== undefined && hashCheck !== hash)
					continue;

				entries.push({
					Hash: hash,
					FileDataID: entry.FileDataID,
					Key: key,
					Type: entry.RootType
				});

				rootIndex[entry.FileDataID] = hash;
			}
		}

		return { Entries: entries, Types: types };
	}

	/**
	 * Return a formatted URL for a file on the patch server.
	 * @param {string} file Name of the server file.
	 * @returns {string}
	 * @private
	 */
	_formatPatchURL(file) {
		return util.format('%s/%s/%s', this.patchServer, this.targetProduct, file);
	}

	/**
	 * Return a formatted URL for a config file on the CDN.
	 * @param {string} key
	 * @returns {string}
	 * @private
	 */
	_formatConfigURL(key) {
		return this._formatDataURL(key, 'config');
	}

	/**
	 * Return a formatted URL for a data file on the CDN.
	 * @param {string} key
	 * @param {string} [dir]
	 * @returns {string}
	 * @private
	 */
	_formatDataURL(key, dir) {
		return util.format('%s/%s/%s/%s', this.cdnServer, this.cdnPath, dir || 'data', CASC._formatDataKey(key));
	}

	/**
	 * Return a formatted URL for an index file on the CDN.
	 * @param {string} key
	 * @returns {string}
	 * @private
	 */
	_formatIndexURL(key) {
		return this._formatDataURL(key) + '.index';
	}

	/**
	 * Return a formatted data key for a CDN URL.
	 * @param {string} key
	 * @returns {string}
	 * @private
	 */
	static _formatDataKey(key) {
		return util.format('%s/%s/%s', key.substring(0, 2), key.substring(2, 4), key);
	}

	/**
	 * Download a file from the patch server.
	 * @param {string} file Name of the file to download.
	 * @returns {Promise.<string>}
	 * @private
	 */
	async _downloadPatchFile(file) {
		return await request(this._formatPatchURL(file), { encoding: 'utf8' });
	}

	/**
	 * Process raw patch server config into an object.
	 * @param {string} data
	 * @returns {Array}
	 * @private
	 */
	static _processVersionConfig(data) {
		let entries = [], fields = [];
		let index = 0, lines = data.split(/\n/);
		for (let line of lines) {
			if (line.trim().length === 0 || line.startsWith('#'))
				continue; // Empty lines/comments.

			let tokens = line.split('|');

			if (index === 0) {
				// Keys
				for (let i = 0; i < tokens.length; i++)
					fields[i] = tokens[i].split('!')[0].replace(' ', '');
			} else {
				// Values
				let node = {};
				for (let i = 0; i < tokens.length; i++) {
					node[fields[i]] = tokens[i];
				}

				entries[index - 1] = node;
			}
			index++;
		}
		return entries;
	}

	/**
	 * Process raw config data from the CDN.
	 * @param {string} data
	 * @returns {object}
	 * @private
	 */
	static _processCDNConfig(data) {
		let entries = {};

		let lines = data.split(/\n/);
		for (let line of lines) {
			if (line.trim().length === 0 || line.startsWith('#'))
				continue; // Empty lines/comments.

			let tokens = line.split('=');
			if (tokens.length !== 2)
				throw new Error('KeyValueConfig has invalid token length.');

			entries[tokens[0].trim()] = tokens[1].trim().split(' ');
		}

		return entries;
	}

	/**
	 * Static constant defining locale flags for root file entries.
	 * @returns {{All: number, None: number, enUS: number, koKR: number, frFR: number, deDE: number, zhCN: number, esES: number, zhTW: number, enGB: number, enCH: number, enTW: number, esMX: number, ruRU: number, ptBR: number, itIT: number, ptPT: number, enSG: number, plPL: number, All_WoW: number}}
	 */
	static get LOCALE_FLAG() {
		return LocaleFlag;
	}

	/**
	 * Static constant defining content flags for root file entries.
	 * @returns {{None: number, F00000001: number, F00000002: number, F00000004: number, F00000008: number, F00000010: number, LowViolence: number, F10000000: number, F20000000: number, Bundle: number, NoCompression: number}}
	 */
	static get CONTENT_FLAG() {
		return ContentFlag;
	}

	/**
	 * Static constant containing the US patch server URL.
	 * @returns {string}
	 */
	static get PATCH_SERVER_US() {
		return 'http://us.patch.battle.net:1119';
	}

	/**
	 * Static constant containing the EU patch server URL.
	 * @returns {string}
	 */
	static get PATCH_SERVER_EU() {
		return 'http://eu.patch.battle.net:1119';
	}

	/**
	 * Static constant containing the KR patch server URL.
	 * @returns {string}
	 */
	static get PATCH_SERVER_KR() {
		return 'http://kr.patch.battle.net:1119';
	}

	/**
	 * Static constant containing the CN patch server URL.
	 * @returns {string}
	 */
	static get PATCH_SERVER_CN() {
		return 'http://cn.patch.battle.net:1119';
	}

	/**
	 * Static constant containing the product tag for World of Warcraft.
	 * @returns {string}
	 */
	static get PRODUCT_WOW() {
		return 'wow';
	}

	/**
	 * Static constant containing the product tag for World of Warcraft (PTR).
	 * @returns {string}
	 */
	static get PRODUCT_WOW_PTR() {
		return 'wowt';
	}

	/**
	 * Static constant containing the product tag for World of Warcraft (Beta).
	 * @returns {string}
	 */
	static get PRODUCT_WOW_BETA() {
		return 'wow_beta';
	}

	/**
	 * Static constant containing the product tag for Diablo 3.
	 * @returns {string}
	 */
	static get PRODUCT_DIABLO_3() {
		return 'd3';
	}

	/**
	 * Static constant containing the product tag for Diablo 3 (PTR).
	 * @returns {string}
	 */
	static get PRODUCT_DIABLO_3_PTR() {
		return 'd3t';
	}

	/**
	 * Static constant containing the product tag for Diablo 3 (Beta).
	 * @returns {string}
	 */
	static get PRODUCT_DIABLO_3_BETA() {
		return 'd3b';
	}

	/**
	 * Static constant containing the product tag for Starcraft 2.
	 * @returns {string}
	 */
	static get PRODUCT_STARCRAFT_2() {
		return 's2';
	}

	/**
	 * Static constant containing the product tag for Starcraft 2 (PTR).
	 * @returns {string}
	 */
	static get PRODUCT_STARCRAFT_2_PTR() {
		return 's2t';
	}

	/**
	 * Static constant containing the product tag for Starcraft 2 (Beta).
	 * @returns {string}
	 */
	static get PRODUCT_STARCRAFT_2_BETA() {
		return 's2b';
	}

	/**
	 * Static constant containing the product tag for Heroes of the Storm.
	 * @returns {string}
	 */
	static get PRODUCT_HEROES() {
		return 'hero';
	}

	/**
	 * Static constant containing the product tag for Heroes of the Storm (PTR).
	 * @returns {string}
	 */
	static get PRODUCT_HEROES_PTR() {
		return 'herot';
	}

	/**
	 * Static constant containing the product tag for Hearthstone.
	 * @returns {string}
	 */
	static get PRODUCT_HEARTHSTONE() {
		return 'hs';
	}

	/**
	 * Static constant containing the product tag for Overwatch.
	 * @returns {string}
	 */
	static get PRODUCT_OVERWATCH() {
		return 'pro'
	}

	/**
	 * Static constant containing the product tag for Starcraft 1.
	 * @returns {string}
	 */
	static get PRODUCT_STARCRAFT_1() {
		return 's1';
	}

	/**
	 * Static constant containing the product tag for Starcraft 1 (PTR).
	 * @returns {string}
	 */
	static get PRODUCT_STARCRAFT_1_PTR() {
		return 's1t';
	}

	/**
	 * Static constant containing the product tag for Warcraft 3.
	 * @returns {string}
	 */
	static get PRODUCT_WARCRAFT_3() {
		return 'w3';
	}

	/**
	 * Static constant containing the product tag for Destiny 2.
	 * @returns {string}
	 */
	static get PRODUCT_DESTINY_2() {
		return 'dst2';
	}

	/**
	 * Static constant containing the product tag for the Battle.net Agent.
	 * @returns {string}
	 */
	static get PRODUCT_BNET_AGENT() {
		return 'argent';
	}

	/**
	 * Static constant containing the product tag for the Battle.net App.
	 * @returns {string}
	 */
	static get PRODUCT_BNET_APP() {
		return 'bna';
	}

	/**
	 * Static constant containing the product tag for the Battle.net Client.
	 * @returns {string}
	 */
	static get PRODUCT_BNET_CLIENT() {
		return 'clnt';
	}
}

module.exports = CASC;