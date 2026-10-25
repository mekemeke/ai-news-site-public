import io
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
import urllib.error

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import publish_video_result as p


class Opener:
    def __init__(self, existing):
        self.requests = []
        self.existing = existing

    def open(self, req, timeout):
        self.requests.append(req)
        if len(self.requests) == 1:
            if not self.existing:
                raise urllib.error.HTTPError(req.full_url, 404, 'not found', {}, None)
            result = {'object': {'sha': 'old'}}
        elif req.full_url.endswith('/git/trees'):
            result = {'sha': 'tree'}
        elif req.full_url.endswith('/git/commits'):
            result = {'sha': 'new'}
        else:
            result = {'object': {'sha': 'new'}}
        return io.BytesIO(json.dumps(result).encode())


class PublishTests(unittest.TestCase):
    def test_create_and_update_only_isolated_result_branch(self):
        for existing in [False, True]:
            opener = Opener(existing)
            with patch.dict(os.environ, {'GITHUB_TOKEN': 'test-token', 'GITHUB_RUN_ID': '123'}):
                with patch.object(Path, 'read_bytes', return_value=b'{"schema_version":1,"run_id":"123"}'):
                    with patch.object(p.urllib.request, 'build_opener', return_value=opener):
                        with patch('sys.stdout', io.StringIO()): p.publish()
            self.assertEqual(len(opener.requests), 5)
            trees = [r for r in opener.requests if r.full_url.endswith('/git/trees')]
            tree = json.loads(trees[0].data)
            self.assertEqual(set(tree), {'tree'})
            self.assertEqual([e['path'] for e in tree['tree']], ['results/latest.json'])
            commit = json.loads(opener.requests[2].data)
            self.assertEqual(commit['parents'], ['old'] if existing else [])
            ref = json.loads(opener.requests[3].data)
            if existing:
                self.assertFalse(ref['force'])
                self.assertTrue(opener.requests[3].full_url.endswith('/heads/api-results'))
            else:
                self.assertEqual(ref['ref'], 'refs/heads/api-results')
            self.assertTrue(all(r.full_url.startswith(p.ROOT + '/') for r in opener.requests))

    def test_wrong_run_rejected_before_network(self):
        with patch.dict(os.environ, {'GITHUB_TOKEN': 'test-token', 'GITHUB_RUN_ID': '123'}):
            with patch.object(Path, 'read_bytes', return_value=b'{"schema_version":1,"run_id":"old"}'):
                with patch.object(p.urllib.request, 'build_opener') as op:
                    with self.assertRaises(p.SafeError): p.publish()
                    op.assert_not_called()


if __name__ == '__main__':
    unittest.main()
