"use strict";

async function latestVersion(packageName) {
  if (!packageName || typeof packageName !== "string") {
    throw new TypeError("packageName must be a non-empty string");
  }

  const encodedName = encodeURIComponent(packageName);
  const response = await fetch(`https://registry.npmjs.org/${encodedName}`, {
    headers: {
      accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch package metadata for ${packageName}: ${response.status}`);
  }

  const metadata = await response.json();
  const latest = metadata && metadata["dist-tags"] && metadata["dist-tags"].latest;

  if (!latest) {
    throw new Error(`Package ${packageName} does not expose a latest dist-tag`);
  }

  return latest;
}

module.exports = latestVersion;
module.exports.default = latestVersion;
