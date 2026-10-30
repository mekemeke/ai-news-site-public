import copy
import datetime as dt
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
import urllib.error
import urllib.parse

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
import video_api as v
import publish_video_result as p
from test_video_api import env

NOW = dt.datetime.now(dt.timezone.utc)
START = v.today_window(NOW)[0]


def entries():
    return [{'channel_id': 'UC' + str(i).zfill(22), 'name': 'Test ' + str(i),
             'genres': ['3DCG', 'terrain'] if i == 0 else ['AI']} for i in range(26)]


def vid(channel, index):
    return str(int(channel[2:]) * 20 + index).zfill(11)


class ChannelFake:
    def __init__(self, count=1, pages=1, description='Public description'):
        self.calls, self.requests, self.usage = 0, [], {}
        self.count, self.pages, self.description = count, pages, description
        self.channel_ids = [e['channel_id'] for e in entries()]
        self.video_channel = {}
        self.fail_at = 0
        self.cross_channel = False
        self.privacy = 'public'
        self.live = 'none'
        self.when = START
        self.omit_details = False
        self.channel_id_override = None
        self.repeated_token = False

    def request(self, url, key, payload=None):
        self.calls += 1
        self.requests.append((url, payload))
        if self.calls == self.fail_at:
            raise v.SafeError('http_429')
        path = urllib.parse.urlsplit(url).path
        q = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
        if path.endswith('/channels'):
            return {'items': [{'id': self.channel_id_override or cid,
                'contentDetails': {'relatedPlaylists': {'uploads': 'PL' + cid[2:]}}}
                for cid in self.channel_ids]}
        if path.endswith('/playlistItems'):
            cid = 'UC' + q['playlistId'][0][2:]
            second = bool(q.get('pageToken'))
            offset = 10 if second else 0
            result = {'items': []}
            for index in range(min(10, self.count)):
                video_id = vid(cid, index + offset)
                self.video_channel[video_id] = cid
                result['items'].append({'contentDetails': {'videoId': video_id,
                    'videoPublishedAt': v.stamp(self.when)}})
            if self.pages > (2 if second else 1):
                result['nextPageToken'] = 'again' if self.repeated_token else ('page3' if second else 'page2')
            return result
        if path.endswith('/videos'):
            if self.omit_details:
                return {'items': []}
            return {'items': [{'id': video_id, 'status': {'privacyStatus': self.privacy},
                'snippet': {'title': 'Example', 'channelTitle': 'Public channel',
                    'channelId': self.channel_ids[-1] if self.cross_channel else self.video_channel[video_id],
                    'description': self.description, 'publishedAt': v.stamp(self.when),
                    'liveBroadcastContent': self.live}, 'contentDetails': {'duration': 'PT20M'}}
                for video_id in q['id'][0].split(',')]}
        raise AssertionError('Unexpected API endpoint')


def collect(client=None):
    client = client or ChannelFake()
    with patch.object(v, 'load_watchlist', return_value=entries()):
        return v.collect(client, env('channels'))


class ChannelTests(unittest.TestCase):
    def setUp(self):
        if self._testMethodName not in {'test_real_watchlist_26_unique_and_shared_houdini',
                                       'test_missing_or_stale_free_gate_and_invalid_watchlist_before_network'}:
            patcher = patch.object(v, 'load_watchlist', return_value=entries())
            patcher.start()
            self.addCleanup(patcher.stop)

    def test_real_watchlist_26_unique_and_shared_houdini(self):
        actual = v.load_watchlist()
        self.assertEqual(len(actual), 26)
        self.assertEqual(len({e['channel_id'] for e in actual}), 26)
        houdini = [e for e in actual if e['handle'].lower() == '@houdini3d']
        self.assertEqual(len(houdini), 1)
        self.assertEqual(set(houdini[0]['genres']), {'3DCG', 'terrain'})
        self.assertIn('@imanyu_programming', [e['handle'] for e in actual])
        self.assertIn('@chaen-ai-lab', [e['handle'] for e in actual])
        olli = [e for e in actual if e['channel_id'] == 'UCYIL1m3Tfa04IgwteS9EnYA']
        self.assertEqual(len(olli), 1)
        self.assertEqual(olli[0]['handle'], '@OlliHuttunen78')
        self.assertEqual(olli[0]['genres'], ['3DCG'])

    def test_26_channels_one_batch_metadata_only_long_video_retained(self):
        client = ChannelFake()
        result = collect(client)
        self.assertEqual(client.calls, 33)  # 1 channels + 26 uploads + 6 detail batches
        self.assertEqual(len(result['videos']), 26)
        self.assertFalse(result['partial'])
        self.assertTrue(result['editor_review_required'])
        self.assertEqual(result['videos'][0]['genres'], ['3DCG', 'terrain'])
        self.assertEqual(result['videos'][0]['duration_seconds'], 1200)
        self.assertNotIn('analysis', result)
        self.assertEqual(result['selection_limit_per_genre'], 4)
        self.assertTrue(all('generativelanguage' not in url and '/search?' not in url for url, _ in client.requests))
        self.assertTrue(all(payload is None for _, payload in client.requests))
        self.assertEqual(result['window']['timezone'], 'Asia/Tokyo')
        self.assertLess(len(v.serialize(result, env('channels')).encode()), v.CHANNEL_OUTPUT_BYTES)

    def test_candidate_cap_and_unread_pages_explicit(self):
        client = ChannelFake(count=10, pages=3)
        result = collect(client)
        self.assertEqual(len(result['videos']), 78)
        self.assertEqual(client.calls, 43)
        self.assertTrue(result['partial'])
        self.assertTrue(all(s['candidates_found'] == 10 and s['candidates_returned'] == 3 for s in result['channels']))
        self.assertTrue(all('candidate_limit' in s['reasons'] and 'pagination_limit' in s['reasons'] for s in result['channels']))

    def test_maximum_66_attempts_for_26_channels_reports_remaining_details(self):
        client = ChannelFake(count=2, pages=3)
        result = collect(client)
        self.assertEqual(client.calls, 66)
        self.assertEqual(len(result['videos']), 65)
        self.assertEqual(result['stop_code'], 'budget_exceeded')
        self.assertTrue(any('details_unavailable' in s['reasons'] for s in result['channels']))
        self.assertTrue(result['partial'])

    def test_two_page_bound_and_first_pass_fairness(self):
        client = ChannelFake(count=1, pages=3)
        result = collect(client)
        self.assertEqual(client.calls, 64)
        self.assertTrue(all(s['pages_fetched'] == 2 for s in result['channels']))
        self.assertTrue(all('pagination_limit' in s['reasons'] for s in result['channels']))
        first_pass = client.requests[1:27]
        self.assertTrue(all('pageToken' not in url for url, _ in first_pass))
        self.assertTrue(all('pageToken=page2' in url for url, _ in client.requests[27:53]))

    def test_403_429_timeout_stop_without_retry_and_report_unchecked(self):
        for code in ['http_403', 'http_429', 'transport_or_json_error', 'redirect_blocked']:
            client = ChannelFake(); original = client.request
            def request(*args, **kwargs):
                if client.calls == 4:
                    client.calls += 1
                    raise v.SafeError(code)
                return original(*args, **kwargs)
            client.request = request
            result = collect(client)
            self.assertEqual(client.calls, 5)
            self.assertTrue(result['partial'])
            self.assertEqual(result['stop_code'], code)
            self.assertEqual(result['videos'], [])  # gathered IDs never masquerade as verified public metadata
            self.assertTrue(any('request_stopped' in c['reasons'] for c in result['channels']))

    def test_elapsed_discovery_budget_is_partial_no_search(self):
        client = ChannelFake()
        with patch.object(v.time, 'monotonic', side_effect=[0, 0] + [61] * 100):
            result = collect(client)
        self.assertEqual(client.calls, 1)
        self.assertTrue(result['partial'])
        self.assertTrue(all('discovery_time_limit' in c['reasons'] for c in result['channels']))

    def test_unknown_channel_and_crossed_video_fail_closed(self):
        client = ChannelFake(); client.channel_id_override = 'UC' + 'x' * 22
        with self.assertRaises(v.SafeError): collect(client)
        self.assertEqual(client.calls, 1)
        client = ChannelFake(); client.cross_channel = True
        with self.assertRaises(v.SafeError): collect(client)

    def test_public_nonlive_and_in_window_only(self):
        for field, value in [('privacy', 'private'), ('privacy', 'unlisted'), ('live', 'live'), ('live', 'upcoming')]:
            client = ChannelFake(); setattr(client, field, value)
            result = collect(client)
            self.assertEqual(result['videos'], [])
            self.assertTrue(all('candidate_not_eligible' in s['reasons'] for s in result['channels']))
        for when in [START - dt.timedelta(seconds=1), NOW + dt.timedelta(days=1)]:
            client = ChannelFake(); client.when = when
            result = collect(client)
            self.assertEqual(result['videos'], [])
            self.assertEqual(client.calls, 27)
        self.assertEqual(len(collect()['videos']), 26)  # exactly JST midnight accepted

    def test_detail_time_rechecked_and_missing_ids_disclosed(self):
        client = ChannelFake(); original = client.request
        def request(url, *args):
            data = original(url, *args)
            if '/videos?' in url:
                for item in data['items']:
                    item['snippet']['publishedAt'] = v.stamp(START - dt.timedelta(seconds=1))
            return data
        client.request = request
        self.assertEqual(collect(client)['videos'], [])
        client = ChannelFake(); client.omit_details = True
        result = collect(client)
        self.assertTrue(all('details_unavailable' in s['reasons'] for s in result['channels']))

    def test_jst_window_utc_previous_day(self):
        now = dt.datetime(2026, 10, 27, 1, 0, tzinfo=dt.timezone.utc)
        start, end = v.today_window(now)
        self.assertEqual(v.stamp(start), '2026-10-26T15:00:00Z')
        self.assertEqual(end, now)

    def test_search_editor_gate_precedes_network_and_has_window(self):
        client = ChannelFake()
        e = env('search'); e['EDITOR_REVIEWED'] = 'false'
        with self.assertRaisesRegex(v.SafeError, 'editor_review_required'): v.collect(client, e)
        self.assertEqual(client.calls, 0)
        from test_video_api import Fake
        client = Fake({'items': []})
        result = v.collect(client, env('search'))
        self.assertIn('publishedAfter=', client.requests[0][0])
        self.assertIn('publishedBefore=', client.requests[0][0])
        self.assertTrue(result['editor_reviewed'])

    def test_missing_or_stale_free_gate_and_invalid_watchlist_before_network(self):
        for field, value in [('FREE_CONFIRMED', 'false'), ('FREE_TIER_VERIFIED_ON', '2000-01-01')]:
            client = ChannelFake(); e = env('channels'); e[field] = value
            with self.assertRaises(v.SafeError): v.collect(client, e)
            self.assertEqual(client.calls, 0)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'watchlist.json'
            for data in [{}, {'schema_version': 1, 'channels': entries()[:-1]},
                         {'schema_version': 1, 'channels': [entries()[0]] * 26}]:
                path.write_text(json.dumps(data))
                client = ChannelFake()
                with patch.object(v, 'WATCHLIST', path):
                    with self.assertRaises(v.SafeError): v.collect(client, env('channels'))
                self.assertEqual(client.calls, 0)

    def test_maximum_utf8_and_overflow_are_bounded_not_silent(self):
        result = collect(ChannelFake(count=10, description='😀' * 2500))
        self.assertEqual(len(result['videos']), 78)
        self.assertTrue(all(len(vd['description']) == 2000 for vd in result['videos']))
        self.assertLessEqual(len(v.serialize(result, env('channels')).encode()), v.CHANNEL_OUTPUT_BYTES)
        result = collect(ChannelFake(count=10, description='\x01' * 2500))
        self.assertLess(len(result['videos']), 78)
        self.assertTrue(any('output_size_limit' in s['reasons'] for s in result['channels']))
        self.assertLessEqual(len(v.serialize(result, env('channels')).encode()), v.CHANNEL_OUTPUT_BYTES)

    def test_secret_echo_and_credential_patterns_blocked(self):
        for desc in [env()['YOUTUBE_API_KEY'], 'AIza' + 'x' * 35]:
            result = collect(ChannelFake(description=desc))
            with self.assertRaises(v.SafeError): v.serialize(result, env('channels'))

    def test_channel_client_only_metadata_endpoints_and_hard_count(self):
        client = v.Client(); client.enable_channel_budget()
        for url in ['https://generativelanguage.googleapis.com/v1beta/interactions',
                    'https://www.googleapis.com/youtube/v3/search']:
            with self.assertRaises(v.SafeError): client.request(url, 'fake')
        self.assertEqual(client.calls, 0)
        client.calls = v.CHANNEL_MAX_CALLS
        with self.assertRaisesRegex(v.SafeError, 'budget_exceeded'):
            client.request('https://www.googleapis.com/youtube/v3/videos', 'fake')
        client = v.Client(); client.enable_channel_budget()
        with patch.object(client.opener, 'open', return_value=io.BytesIO(b'{"items":[]}')) as opener:
            client.request('https://www.googleapis.com/youtube/v3/videos', 'fake')
            self.assertLessEqual(opener.call_args.kwargs['timeout'], 5)

    def test_channel_publisher_validates_before_network(self):
        good = collect()
        cases = []
        for mutate in [lambda r: r.update(extra='private'), lambda r: r.update(partial=True),
                       lambda r: r['videos'][0].update(url='https://evil.invalid'),
                       lambda r: r['videos'][0].update(genres=['ESO']),
                       lambda r: r['channels'][0].update(candidates_returned=0),
                       lambda r: r['channels'][0].update(name='Not the approved channel')]:
            bad = copy.deepcopy(good); mutate(bad); cases.append(bad)
        for bad in cases:
            with patch.dict(os.environ, {'GITHUB_TOKEN': 'test-token', 'GITHUB_RUN_ID': '123'}):
                with patch.object(Path, 'read_bytes', return_value=json.dumps(bad).encode()):
                    with patch.object(p.urllib.request, 'build_opener') as opener:
                        with self.assertRaises(v.SafeError): p.publish()
                        opener.assert_not_called()
        from test_publish_video_result import Opener
        opener = Opener(True)
        with patch.dict(os.environ, {'GITHUB_TOKEN': 'test-token', 'GITHUB_RUN_ID': '123'}):
            with patch.object(Path, 'read_bytes', return_value=json.dumps(good).encode()):
                with patch.object(p.urllib.request, 'build_opener', return_value=opener):
                    with patch('sys.stdout', io.StringIO()): p.publish()
        self.assertEqual(len(opener.requests), 5)
        self.assertEqual(json.loads(opener.requests[1].data)['tree'][0]['path'], 'results/latest.json')

    def test_existing_modes_output_cap_remains_32768(self):
        with self.assertRaisesRegex(v.SafeError, 'output_too_large'):
            v.serialize({'mode': 'search', 'data': 'a' * 33000}, {})


if __name__ == '__main__':
    unittest.main()
