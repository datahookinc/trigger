## Bump version

`npm version <patch | minor | major>`

- Patch: `npm version patch`
- Minor: `npm version minor`
- Major: `npm version major`

This will run the following scripts:

- `preversion`
- `version`
- `postversion`


## Publish package

This will run the following scripts:

- `prepare`
- `prepublishOnly`
