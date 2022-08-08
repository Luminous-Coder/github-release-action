const core = require("@actions/core");
const fs = require("fs");
const {context} = require("@actions/github");
const {GitHub} = require("@actions/github/lib/utils");

async function run() {
    if (!process.env.GITHUB_TOKEN) {
        throw "The GitHub token wasn't set.";
    }

    // Get the changelog and parse to get the note about the latest version.
    const changelog = fs.readFileSync(core.getInput("changelog")).toString();
    const {version, body} = getLatestChangelog(changelog);

    const gh = new GitHub(process.env.GITHUB_TOKEN);

    // Create release.
    const title = core.getInput("title").replaceAll(/\{version}/, version);
    const {
        data: {
            id: releaseId,
            html_url: htmlUrl,
            upload_url: uploadUrl
        }
    } = await gh.rest.repos.createRelease({
        ...context.repo,
        tag_name: title,
        name: title,
        body,
        generate_release_notes: true
    });

    // Upload asset.
    const assetName = core.getInput("asset-name");
    if (assetName !== "") {
        const assetLabel = core.getInput("asset-label").length !== 0 ?
            core.getInput("asset-label") : assetName;

        await gh.rest.repos.uploadReleaseAsset({
            ...context.repo,
            release_id: releaseId,
            name: assetLabel,
            data: fs.readFileSync(assetName).toString()
        });
    }

    core.setOutput("release-id", releaseId);
    core.setOutput("html-url", htmlUrl);
    core.setOutput("upload-url", uploadUrl);
}

function getLatestChangelog(changelog) {
    // Find the latest version.
    let i = changelog.search(/## *[\w0-9.-]*/);
    if (i === -1) {
        throw "Couldn't find any version in the changelog.";
    }

    // Ignore the spaces between the hashtags and the version.
    for (i += 2; changelog[i] === ' '; i++) {}

    // The version ends with a space (if there's a timestamp after the version) or a newline.
    const versionBegin = i;
    while (changelog[i] !== ' ' && changelog[i] !== '\n') {
        i++;
    }
    const version = changelog.substring(versionBegin, i);

    // Skip the timestamp after the version if had.
    while (changelog[i] !== '\n') {
        // If the last character in the whole changelog is still not a newline,
        // the changelog of this version is empty.
        if (i === changelog.length - 1) {
            return {version, body: ""};
        }
        i++;
    }
    // If the last character in the whole changelog is a newline,
    // the changelog of this version is empty, too.
    if (i === changelog.length - 1) {
        return {version, body: ""};
    }
    i++;

    // The changelog body ends with an older version.
    const bodyBegin = i;
    i = changelog.search(/\n+##[^#]/);
    if (i === -1) {
        i = changelog.search(/\n*\Z/);
    }
    const body = changelog.substring(bodyBegin, i);

    return {version, body};
}

try {
    run().then(_ => {});
} catch (err) {
    core.setFailed(err);
}
