const commonjs = require( "@rollup/plugin-commonjs" );
const resolve = require( "@rollup/plugin-node-resolve" );
const json = require( "@rollup/plugin-json" );
const nodePolyfills = require("rollup-plugin-node-polyfills");

module.exports =
{
	input: "src/Scripts/main.js",
	plugins: [
		commonjs(),
		resolve({
			  preferBuiltins: false
		}),
		json(),
		nodePolyfills(),
	],

	output: {
		file: "CloudflareR2.novaextension/Scripts/main.dist.js",
		format: "cjs",
		exports: "named",
	},
};