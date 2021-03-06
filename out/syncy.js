'use strict';
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const chalk = require("chalk");
const isGlob = require("is-glob");
const globParent = require("glob-parent");
const globby = require("globby");
const cpf = require("cp-file");
const minimatch = require("minimatch");
const io = require("./lib/io");
const utils = require("./lib/utils");
function getLogProvider(options) {
    if (typeof options.verbose === 'function') {
        return options.verbose;
    }
    else if (options.verbose) {
        return (stamp) => {
            let str = '';
            if (stamp.action === 'remove') {
                str = chalk.red('Removing: ') + stamp.from;
            }
            else if (stamp.action === 'copy') {
                str = chalk.green('Copying: ') + stamp.from + chalk.cyan(' -> ') + stamp.to;
            }
            console.log(str);
        };
    }
    else {
        return () => {
        };
    }
}
function assertPatternsInput(patterns, dest) {
    if (patterns.length === 0) {
        throw new TypeError('patterns must be a string or an array of strings');
    }
    for (let i = 0; i < patterns.length; i++) {
        if (typeof patterns[i] !== 'string' || !isGlob(patterns[i]) || !patterns[i]) {
            throw new TypeError('patterns must be a glob-pattern. See https://github.com/isaacs/node-glob#glob-primer');
        }
    }
    if (!dest || (dest && !Array.isArray(dest) && typeof dest !== 'string')) {
        throw new TypeError('dest must be a string or an array of strings');
    }
}
function run(patterns, dest, sourceFiles, options, log) {
    return __awaiter(this, void 0, void 0, function* () {
        const arrayOfPromises = [];
        yield io.pathExists(dest).then((exists) => {
            if (!exists) {
                return io.makeDirectory(dest);
            }
        });
        
		// Actually ignore the paths specificed in 'ignoreInDest' option
		const ignoreInDestArr = Array.isArray(options.ignoreInDest) ? options.ignoreInDest : [options.ignoreInDest];
        const destFiles = yield globby(['**'].concat(ignoreInDestArr.map(v => { return "!" + v; })), {
            cwd: dest,
            dot: true,
            nosort: true,
			nocase: true
        });
	
        const excludedFiles = options.ignoreInDest.reduce((ret, pattern) => {
            return ret.concat(minimatch.match(destFiles, pattern, { dot: true }));
        }, []).map((filepath) => utils.pathFromDestToSource(filepath, options.base));
        let partsOfExcludedFiles = [];
        for (let i = 0; i < excludedFiles.length; i++) {
            partsOfExcludedFiles = partsOfExcludedFiles.concat(utils.expandDirectoryTree(excludedFiles[i]));
        }
        if (options.updateAndDelete) {
            let treeOfBasePaths = [''];
            patterns.forEach((pattern) => {
                const parentDir = globParent(pattern);
                const treePaths = utils.expandDirectoryTree(parentDir);
                treeOfBasePaths = treeOfBasePaths.concat(treePaths);
            });
            const fullSourcePaths = sourceFiles.concat(treeOfBasePaths, partsOfExcludedFiles);
            for (let i = 0; i < destFiles.length; i++) {
                const destFile = destFiles[i];
                const pathFromDestToSource = utils.pathFromDestToSource(destFile, options.base);
                let skipIteration = false;
                for (let i = 0; i < fullSourcePaths.length; i++) {
                    if (fullSourcePaths[i].indexOf(pathFromDestToSource) !== -1) {
                        skipIteration = true;
                        break;
                    }
                }
                if (skipIteration) {
                    continue;
                }
                const pathFromSourceToDest = utils.pathFromSourceToDest(destFile, dest, null);
                const removePromise = io.removeFile(pathFromSourceToDest, { disableGlob: true }).then(() => {
                    log({
                        action: 'remove',
                        from: destFile,
                        to: null
                    });
                }).catch((err) => {
                    throw new Error(`Cannot remove '${pathFromSourceToDest}': ${err.code}`);
                });
                arrayOfPromises.push(removePromise);
            }
        }
        for (let i = 0; i < sourceFiles.length; i++) {
            const from = sourceFiles[i];
            const to = utils.pathFromSourceToDest(from, dest, options.base);
            const statFrom = io.statFile(from);
            const statDest = io.statFile(to).catch((err) => null);
            const copyAction = Promise.all([statFrom, statDest]).then((stat) => {
                if (utils.skipUpdate(stat[0], stat[1], options.updateAndDelete)) {
                    return;
                }
                return cpf(from, to).then(() => {
                    log({
                        action: 'copy',
                        from,
                        to
                    });
                }).catch((err) => {
                    throw new Error(`'${from}' to '${to}': ${err.message}`);
                });
            });
            arrayOfPromises.push(copyAction);
        }
        return Promise.all(arrayOfPromises);
    });
}
exports.run = run;
function syncy(source, dest, options) {
    return __awaiter(this, void 0, void 0, function* () {
        const patterns = [].concat(source);
        const destination = [].concat(dest);
        try {
            destination.forEach((item) => {
                assertPatternsInput(patterns, item);
            });
        }
        catch (err) {
            return Promise.reject(err);
        }
        options = Object.assign({
            updateAndDelete: true,
            verbose: false,
            ignoreInDest: []
        }, options);
        options.ignoreInDest = [].concat(options.ignoreInDest);
        const log = getLogProvider(options);
        if (options.base && options.base.endsWith('/')) {
            options.base = options.base.slice(0, -1);
        }
        return globby(patterns, {
            dot: true,
            nosort: true
        }).then((sourceFiles) => {
            return Promise.all(destination.map((item) => run(patterns, item, sourceFiles, options, log)));
        });
    });
}
exports.default = syncy;
