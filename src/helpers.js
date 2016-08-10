/* @flow */

import { exec } from 'sb-exec'
import hostedGitInfo from 'hosted-git-info'

const VALID_TICKS = new Set(['✓', 'done'])
const VALIDATION_REGEXP = /(?:Installing|Moving) (.*?) to .* (.*)/

export function apmInstall(dependencies: Array<string>, progressCallback: ((packageName: string, status: boolean) => void)): Promise<Map<string, Error>> {
  const errors = new Map()
  return Promise.all(dependencies.map(function(dependency) {
    return exec(atom.packages.getApmPath(), ['install', dependency, '--production', '--color', 'false'], {
      stream: 'both',
      ignoreExitCode: true,
    }).then(function(output) {
      const successful = VALIDATION_REGEXP.test(output.stdout) && VALID_TICKS.has(VALIDATION_REGEXP.exec(output.stdout)[2])
      progressCallback(dependency, successful)
      if (!successful) {
        const error = new Error(`Error installing dependency: ${dependency}`)
        error.stack = output.stderr
        throw error
      }
    }).catch(function(error) {
      errors.set(dependency, error)
    })
  })).then(function() {
    return errors
  })
}

export async function enablePackage(packageName: string): Promise<void> {
  if (atom.packages.isPackageDisabled(packageName)) {
    atom.packages.enablePackage(packageName)
  }
  if (!atom.packages.isPackageLoaded(packageName)) {
    atom.packages.loadPackage(packageName)
  }
  if (!atom.packages.isPackageActive(packageName)) {
    await atom.packages.activatePackage(packageName)
  }
}

// stolen from atom/apm, because we can't require('apm') here
// see https://github.com/atom/apm/blob/master/src/install.coffee#L559-L572
function getNormalizedGitUrls(packageUrl: string): Array<string> {
  const packageInfo = hostedGitInfo.fromUrl(packageUrl)

  if (packageUrl.indexOf('file://') === 0) {
    return [packageUrl]
  } else if (packageInfo.default === 'sshurl') {
    return [packageInfo.toString()]
  } else if (packageInfo.default === 'https') {
    return [packageInfo.https().replace(/^git\+https:/, 'https:')]
  } else if (packageInfo.default === 'shortcut') {
    return [
      packageInfo.https().replace(/^git\+https:/, 'https:'),
      packageInfo.sshurl(),
    ]
  }

  return []
}

function resolvePackage(packageName:string): Boolean {
  if (atom.packages.resolvePackagePath(packageName)) {
    return true
  }

  const gitUrls = new Set(getNormalizedGitUrls(packageName))
  if (gitUrls.length) {
    for (const eachPackage in atom.packages.getLoadedPackages()) {
      if (eachPackage
          && eachPackage.metadata
          && eachPackage.metadata.repository
          && eachPackage.metadata.repository.url
          && gitUrls.has(eachPackage.metadata.repository.url)) {
            // FIXME: does not handle URLs canonicalized by npm
        return true
      }
    }
  }

  return false
}

export function getDependencies(packageName: string): Array<string> {
  const toReturn = []
  const packageModule = atom.packages.getLoadedPackage(packageName)
  const packageDependencies = packageModule && packageModule.metadata['package-deps']

  if (packageDependencies) {
    for (const entry of (packageDependencies: Array<string>)) {
      if (__steelbrain_package_deps.has(entry) || resolvePackage(entry)) {
        continue
      }
      __steelbrain_package_deps.add(entry)
      toReturn.push(entry)
    }
  } else {
    console.error(`[Package-Deps] Unable to get loaded package '${packageName}'`)
  }

  return toReturn
}
