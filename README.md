# blizzard-casc
Utility for interacting with the CASC CDN servers used to distribute Blizzard Entertainment game content.

| Game | Supported |
| ---- | --------- |
| World of Warcraft | Yes |
| Diablo 3 | No |
| Hearthstone | No |
| Heroes of the Storm | No |
| Starcraft 1 | No |
| Starcraft 2 | No |
| Destiny 2 | No |

### Q: I copied the example code and it doesn't work.
A: Read through the comments in the example rather than copy/pasting.

### Q: Why isn't there a single function that just downloads the exact file I want?
A: This is intended as an interface that handles the dirty work for writing tools that interact with CASC. If you're using this module, you should be taking consideration and indexing/caching the results of these functions rather than railing Blizzard's CDN, bundling everything into memory and hoping for the best.

## Installing
```
npm install blizzard-casc
```

## Example Usage
```javascript
// WARNING: This example is intended to outline the functionality of the API provided
// by this module and is NOT an example of implementation. Don't just copy/paste.

// Import CASC class module.
const CASC = require('blizzard-casc');

let casc = new CASC(); // Create new instance.
let cdnList = await casc.downloadCDNList(); // Obtain CDN list.
let versionList = await casc.downloadVersionList(); // Obtain version list.

// Do something intelligent to select a CDN from the list => selectedCdn
// Do something intelligent to select a matching version => selectedVersion

// Obtain the CDN and build config structures for this version.
let cdnConfig = await casc.downloadConfigFile(selectedVersion.CDNConfig);
let buildConfig = await casc.downloadConfigFile(selectedVersion.BuildConfig);

// parseIndexFile() can parse pre-downloaded archives or download by key.
// Index these using a database or hash-table, whatever works for your application.
// Be sure to index entries using the archive keys, you'll need this later for reading files.
let archives = {};
for (let archive of cdnConfig.archives)
    archives[archive] = await casc.parseIndexFile(archive, archives);
    
// parseEncodingFile() can parse pre-downloaded encoding files or download by key.
// Again, you should index these entries in a database or hash table.
let encoding = await casc.parseEncodingFile(buildConfig.encoding[1]);

// Match buildConfig.root[0] with an encoding entry using your method of indexing => rootKey

// parseRootFile() can parse pre-downloaded files or download by key, as shown here.
// Index results and cache where needed! This goes for all these calls!
let root = await casc.parseRootFile(rootKey);

// root.Entries contains all the entries.
// root.Types contains locale/content pairs which cross-reference by index to root.Entries[].Type.

// Using the above, we can produce the following workflow to obtain files.
// 1. Obtain Jenkins96 hash for a file path. (https://github.com/Kruithne/node-jenkins96)
// 2. Look-up the root entry for this file, matching the hash to the `Hash` property.
// Note: There may be multiple. Use locale/content flags to get the file version you want.
// 3. Obtain encoding entry which has the `Hash` matching the `Key` from the root entry.
// 4. Obtain the archive entry which has the `Hash` matching they `Key` from the encoding entry.
// 5. Download the archive using the archive key you indexed the archive index with.
// 6. Copy the data [offset -> offset + size] (values from the archive entry) from the archive.
// 7. Open the data using the BLTEReader class (https://github.com/Kruithne/node-blte).
// 8. If encrypted, ensure you have the correct encryption keys added to the BLTEReader class.
// 9. Read your data. Done.
```

## API

### `patchServer` : `string`
Returns the URL of the patch server this instance will use. If not set using `setPatchServer()`, will return `PATCH_SERVER_US` by default.

### `targetProduct` : `string`
Return the target product as set by `setTargetProduct()`. If accessed before a product is set, an error will be thrown.

### `cdnServer` : `string`
Return the CDN server used to obtain data. If not set using `setCDNServer()`, an error will be thrown.

### `cdnPath` : `string`
Return the CDN path used to obtain data. If not set using `setCDNServer()`, an error will be thrown.

### `setPatchServer(url)`
Set the URL of the patch server to be used for obtaining config.
This can be a custom URL or one of the pre-defined `PATCH_SERVER_*` constants provided by the `CASC` class.

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| url | `string` | Expected format: `http://hostname:port` |

### `setCDNServer(host, path)`
Set the CDN server host to be used for obtaining data. For most purposes, the hostname and path should be obtained using `downloadCDNList()`.

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| host | `string` | Hostname (e.g `edgecast.blizzard.com`).
| path | `string` | CDN path (e.g `tpr/wow`). |

### `setTargetProduct(tag)`
Set the target product to obtain data for. Use the `PRODUCT_*` constants provided by the `CASC` class.

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| tag | `string` | Product tag (e.g `wow_beta`). |

### `async downloadCDNList()`
Download the CDN list from the patch server.

```javascript
// Example response, trimmed for documentation purposes.
[ { Name: 'eu',
    Path: 'tpr/wow',
    Hosts: 'edgecast.blizzard.com blzddist1-a.akamaihd.net level3.blizzard.com',
    ConfigPath: 'tpr/configs/data' },
  [length]: 1 ]
```

### `async downloadVersionList()`
Download the build version list from the patch server.

```javascript
// Example response, trimmed for documentation purposes.
[ { Region: 'us',
    BuildConfig: '9af48e10cc8066587aa2004c47a0d4f7',
    CDNConfig: 'c343ed36eb3616c4b7b682f904601675',
    KeyRing: '',
    BuildId: '25383',
    VersionsName: '7.3.2.25383',
    ProductConfig: '' },
  [length]: 1 ]
```

### `async downloadConfigFile(key)`
Download a config file from the CDN server.

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| key | `string` | Key of the config file to download. |

### `async downloadIndexFile(key)`
Download an index file from the CDN server.

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| key | `string` | Key of the index file to download. |

### `async downloadDataFile(key)`
Download a data file from the CDN server.

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| key | `string` | Key of the data file to download. |

### `async parseIndexFile(archive)`
Parse an index file and return the entries from it. You can provide a pre-downloaded archive file either as a Buffer or Bufo object, or provide an archive key (string) and it will be downloaded providing the CASC instance is set-up to download.

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| archive | `Buffer\|Bufo|\string` | Archive key, or pre-existing data buffer. |

### `async parseEncodingFile(encoding)`
Parse an encoding file and return all entries from it. You can provide a pre-downloaded encoding file as an BLTEReader instance, or provide an encoding key (string) and it will be downloaded providing the CASC instance is set-up to download.

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| encoding | `BLTEReader\|string | Encoding key or pre-loaded data. |

### `async parseRootFile(root)`
Parse an root file and return all entries from it, along with an index of flag pairs. You can provide a pre-downloaded encoding file as an BLTEReader instance, or provide a root key (string) and it will be downloaded providing the CASC instance is set-up to download.

The return result of this function is an object containing `Entries`, which is an array of entries, and `Types`, which is an array of content/locale pairs cross-referenced by index using the `Type` property in each entry.

| Parameter | Type | Description |
| --------- | ---- | ----------- |
| encoding | `BLTEReader\|string | Encoding key or pre-loaded data. |

### `CASC.LOCALE_FLAG` : `object`
Static constant defining locale flags for root file entries.

```javascript
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
```

### `CASC.CONTENT_FLAG` : `object`
Static constant defining content flags for root file entries.

```javascript
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
```

### `CASC.PATCH_SERVER_EU` : `string`
Static constant defining the EU patch server URL. For use with `setPatchServer()`.

### `CASC.PATCH_SERVER_US` : `string`
Static constant defining the US patch server URL. For use with `setPatchServer()`.

### `CASC.PATCH_SERVER_KR` : `string`
Static constant defining the KR patch server URL. For use with `setPatchServer()`.

### `CASC.PATCH_SERVER_CN` : `string`
Static constant defining the CN patch server URL. For use with `setPatchServer()`.

### `CASC.PRODUCT_WOW` : `string`
Static constant defining the product tag for World of Warcraft. For use with `setTargetProduct()`.

### `CASC.PRODUCT_WOW_PTR` : `string`
Static constant defining the product tag for World of Warcraft (PTR). For use with `setTargetProduct()`.

### `CASC.PRODUCT_WOW_BETA` : `string`
Static constant defining the product tag for World of Warcraft (Beta). For use with `setTargetProduct()`.

### `CASC.PRODUCT_DIABLO_3` : `string`
Static constant defining the product tag for Diablo 3. For use with `setTargetProduct()`.

### `CASC.PRODUCT_DIABLO_3_PTR` : `string`
Static constant defining the product tag for Diablo 3 (PTR). For use with `setTargetProduct()`.

### `CASC.PRODUCT_DIABLO_3_BETA` : `string`
Static constant defining the product tag for Diablo 3 (Beta). For use with `setTargetProduct()`.

### `CASC.PRODUCT_STARCRAFT_2` : `string`
Static constant defining the product tag for Starcraft 2. For use with `setTargetProduct()`.

### `CASC.PRODUCT_STARCRAFT_2_PTR` : `string`
Static constant defining the product tag for Starcraft 2 (PTR). For use with `setTargetProduct()`.

### `CASC.PRODUCT_STARCRAFT_2_BETA` : `string`
Static constant defining the product tag for Starcraft 2 (Beta). For use with `setTargetProduct()`.

### `CASC.PRODUCT_HEROES` : `string`
Static constant defining the product tag for Heroes of the Storm. For use with `setTargetProduct()`.

### `CASC.PRODUCT_HEROES_PTR` : `string`
Static constant defining the product tag for Heros of the Storm (PTR). For use with `setTargetProduct()`.

### `CASC.PRODUCT_HEARTHSTONE` : `string`
Static constant defining the product tag for Hearthstone. For use with `setTargetProduct()`.

### `CASC.PRODUCT_OVERWATCH` : `string`
Static constant defining the product tag for Overwatch. For use with `setTargetProduct()`.

### `CASC.PRODUCT_STARCRAFT_1` : `string`
Static constant defining the product tag for Starcraft 1. For use with `setTargetProduct()`.

### `CASC.PRODUCT_STARCRAFT_1_PTR` : `string`
Static constant defining the product tag for Starcraft 1 (PTR). For use with `setTargetProduct()`.

### `CASC.PRODUCT_WARCRAFT_3` : `string`
Static constant defining the product tag for Warcraft 3. For use with `setTargetProduct()`.

### `CASC.PRODUCT_DESTINY_2` : `string`
Static constant defining the product tag for Destiny 2. For use with `setTargetProduct()`.

### `CASC.PRODUCT_BNET_AGENT` : `string`
Static constant defining the product tag for the Battle.net agent. For use with `setTargetProduct()`.

### `CASC.PRODUCT_BNET_APP` : `string`
Static constant defining the product tag for the Battle.net app. For use with `setTargetProduct()`.

### `CASC.PRODUCT_BNET_CLIENT` : `string`
Static constant defining the product tag for the Battle.net client. For use with `setTargetProduct()`.