"""Publish one bounded JSON file to an isolated results branch, never main."""
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.request
from video_api import NoRedirect, SafeError, serialize

ROOT = "https://api.github.com/repos/mekemeke/ai-news-site-public"
BRANCH = "api-results"
PATH = "results/latest.json"


def publish():
    token = os.environ["GITHUB_TOKEN"]
    raw = Path("out/result.json").read_bytes()
    if len(raw) > 32768:
        raise SafeError("invalid_artifact")
    result = json.loads(raw)
    if result.get("schema_version") != 1 or result.get("run_id") != os.environ["GITHUB_RUN_ID"]:
        raise SafeError("invalid_artifact")
    content = serialize(result, os.environ)
    opener = urllib.request.build_opener(NoRedirect)

    def api(path, body=None, method=None, missing_ok=False):
        req = urllib.request.Request(ROOT + path,
            data=None if body is None else json.dumps(body).encode(), method=method,
            headers={"Authorization": "Bearer " + token, "Accept": "application/vnd.github+json",
                     "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json"})
        try:
            with opener.open(req, timeout=20) as response:
                return json.loads(response.read(131072))
        except urllib.error.HTTPError as exc:
            if missing_ok and exc.code == 404:
                return None
            raise SafeError("github_http_" + str(exc.code)) from None

    previous = api("/git/ref/heads/" + BRANCH, missing_ok=True)
    # No base_tree: this branch contains only the single result file, no site files.
    tree = api("/git/trees", {"tree": [{"path": PATH, "mode": "100644", "type": "blob", "content": content}]})
    commit = api("/git/commits", {"message": "Update public API result", "tree": tree["sha"],
                 "parents": [previous["object"]["sha"]] if previous else []})
    if previous:
        api("/git/refs/heads/" + BRANCH, {"sha": commit["sha"], "force": False}, "PATCH")
    else:
        api("/git/refs", {"ref": "refs/heads/" + BRANCH, "sha": commit["sha"]})
    check = api("/git/ref/heads/" + BRANCH)
    if check["object"]["sha"] != commit["sha"]:
        raise SafeError("publish_verification_failed")
    print("status=published branch=api-results path=results/latest.json")


if __name__ == "__main__":
    try:
        publish()
    except SafeError as exc:
        print("status=failed code=" + str(exc))
        sys.exit(1)
    except Exception:
        print("status=failed code=publish_error")
        sys.exit(1)
