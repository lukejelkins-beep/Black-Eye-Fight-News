import datetime as dt
import importlib.util
import json
import pathlib
import unittest

p=pathlib.Path(__file__).parents[1]/'scripts/refresh-fight-film.py'
spec=importlib.util.spec_from_file_location('fight_film',p)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class FilmTests(unittest.TestCase):
 def test_shorts_are_marked_from_youtubes_own_answer(self):
  import io,urllib.error
  class Opener:
   def __init__(self,answer):self.answer=answer
   def open(self,req,timeout=10):
    if self.answer==200:
     class R:
      status=200
      def __enter__(s):return s
      def __exit__(s,*a):return False
     return R()
    raise urllib.error.HTTPError(req.full_url,self.answer,'x',{'Location':self.loc},io.BytesIO())
  o=Opener(200);self.assertIs(m.is_youtube_short('mUKBT9jY--w',o),True)
  o=Opener(303);o.loc='https://www.youtube.com/watch?v=08tvCDKpPRo';self.assertIs(m.is_youtube_short('08tvCDKpPRo',o),False)
  o=Opener(303);o.loc='https://consent.youtube.com/';self.assertIsNone(m.is_youtube_short('08tvCDKpPRo',o))
  o=Opener(429);o.loc='';self.assertIsNone(m.is_youtube_short('08tvCDKpPRo',o))
  self.assertIsNone(m.is_youtube_short('bad id'))
 def test_mark_shorts_only_sets_known_answers_and_respects_the_limit(self):
  vids=[{'id':'yt-AAAAAAAAAAA'},{'id':'yt-BBBBBBBBBBB'},{'id':'yt-CCCCCCCCCCC','isShort':False},{'id':'ufc-1'},{'id':'yt-DDDDDDDDDDD'}]
  answers={'AAAAAAAAAAA':True,'BBBBBBBBBBB':None,'DDDDDDDDDDD':False}
  n=m.mark_shorts(vids,check=lambda i:answers[i],limit=2)
  self.assertEqual(n,2)
  self.assertIs(vids[0]['isShort'],True);self.assertNotIn('isShort',vids[1]);self.assertNotIn('isShort',vids[4])
 def test_curated_upload_filter(self):
  self.assertTrue(m.qualifies('HUGE KO! Smith vs Brown | UFC 2026 Highlights','MMA'))
  self.assertTrue(m.qualifies('Every Submission From IBJJF No-Gi Pans','BJJ / Grappling'))
  self.assertTrue(m.qualifies('RAF wrestling pin highlights','Wrestling / RAF'))
  self.assertFalse(m.qualifies('Smith vs Brown Press Conference','MMA'))
  self.assertFalse(m.qualifies('How To Finish An Armbar | Tutorial','BJJ / Grappling'))
  self.assertFalse(m.qualifies('Preview: Smith vs Brown KO Predictions','MMA'))
 def test_parse_youtube_atom(self):
  xml='''<feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015">
  <entry><yt:videoId>AbCdEf12345</yt:videoId><title>KO | Smith vs Brown UFC Highlights</title><published>2026-11-07T11:00:00Z</published></entry>
  <entry><yt:videoId>AbCdEf12346</yt:videoId><title>Press conference | Smith vs Brown</title><published>2026-11-07T09:00:00Z</published></entry></feed>'''
  result=m.parse_feed(xml,'UFC','combat','MMA',dt.date(2026,11,8))
  self.assertEqual(len(result),1)
  self.assertEqual(result[0]['url'],'https://www.youtube.com/watch?v=AbCdEf12345')
 def test_au_player_requires_explicit_country_and_real_thumbnail(self):
  video_id='AbCdEf12345'
  def player(countries,status='OK',thumbnail=True):
   obj={'playabilityStatus':{'status':status},
    'videoDetails':{'videoId':video_id,'thumbnail':{'thumbnails':([
      {'url':'https://i.ytimg.com/vi/'+video_id+'/mqdefault.jpg','width':320,'height':180}
     ] if thumbnail else [])}},
    'microformat':{'playerMicroformatRenderer':{'availableCountries':countries}}}
   return 'var ytInitialPlayerResponse = '+json.dumps(obj)+';'
  valid=m.parse_australian_player(player(['AU','NZ','US']),video_id)
  self.assertTrue(valid['auAvailable'])
  self.assertEqual(valid['auVerification'],'youtube-country-metadata')
  self.assertIn(video_id,valid['thumbnail'])
  self.assertIsNone(m.parse_australian_player(player(['US','NZ']),video_id))
  self.assertIsNone(m.parse_australian_player(player(['AU'],status='LOGIN_REQUIRED'),video_id))
  self.assertIsNone(m.parse_australian_player(player(['AU'],thumbnail=False),video_id))
  self.assertIsNone(m.parse_australian_player('ytInitialPlayerResponse = {};',video_id))
  self.assertIsNone(m.parse_australian_player('Not a YouTube video',video_id))
 def test_official_region_restrictions(self):
  vid='AbCdEf12345'
  payload={'items':[{'id':vid,'status':{'privacyStatus':'public'},
    'snippet':{'thumbnails':{'medium':{'url':'https://i.ytimg.com/vi/'+vid+'/mqdefault.jpg'}}},
    'contentDetails':{'regionRestriction':{'allowed':['AU','NZ']}}}]}
  accepted=m.parse_youtube_data_api(payload,vid)
  self.assertTrue(accepted['auAvailable'])
  self.assertEqual(accepted['auVerification'],'youtube-api-region-restriction')
  self.assertIn(vid,accepted['thumbnail'])
  payload['items'][0]['contentDetails']['regionRestriction']={'allowed':['US']}
  self.assertIsNone(m.parse_youtube_data_api(payload,vid))
  payload['items'][0]['contentDetails']['regionRestriction']={'blocked':['AU']}
  self.assertIsNone(m.parse_youtube_data_api(payload,vid))
  payload['items'][0]['contentDetails']['regionRestriction']={}
  self.assertTrue(m.parse_youtube_data_api(payload,vid)['auAvailable'])
  payload['items'][0]['status']['privacyStatus']='private'
  self.assertIsNone(m.parse_youtube_data_api(payload,vid))
 def test_region_filter_never_promotes_unchecked_clip(self):
  film={'videos':[{'url':'https://example.com/clip','category':'boxing','verified':True,'thumbnail':''}]}
  results={'results':[{'sport':'MMA','status':'completed','date':'2026-11-07',
     'fighters':[{'name':'Davey Grant'},{'name':'Elijah Smith'}]}]}
  unverified={'id':'yt-AbCdEf12345','category':'combat','title':'Grant vs Smith UFC KO Highlights',
     'date':'2026-11-08','url':'https://www.youtube.com/watch?v=AbCdEf12345',
     'publisher':'UFC','thumbnail':'https://i.ytimg.com/vi/AbCdEf12345/mqdefault.jpg','isFinish':True}
  self.assertEqual(m.merge_video(film,results,[unverified]),(0,0))
  self.assertEqual(film['videos'],[])
  self.assertNotIn('highlights',results['results'][0])
 def test_preserves_official_public_clip_without_fake_au_approval(self):
  today=dt.datetime.now(dt.timezone.utc).date().isoformat()
  clip={'id':'ufc-vegas-test','sourceType':'publisher-video-page','verified':True,
        'category':'combat','isFinish':True,'eventId':'ufc-example',
        'date':today,'url':'https://www.ufc.com/video/161728',
        'thumbnail':'https://a.espncdn.com/i/headshots/mma/players/full/5120304.png'}
  self.assertTrue(m.curated_official_video(clip))
  film={'videos':[clip]}
  results={'results':[]}
  self.assertEqual(m.merge_video(film,results,[]),(0,0))
  self.assertEqual(len(film['videos']),1)
  self.assertNotIn('auAvailable',film['videos'][0])
  self.assertFalse(m.curated_official_video({**clip,'url':'https://fake.example.com/video/161728'}))
  self.assertFalse(m.curated_official_video({**clip,'verified':False}))
 def test_only_exact_bout_matches(self):
  bout={'sport':'MMA','status':'completed','date':'2026-11-07','fighters':[{'name':'Elijah Smith'},{'name':'Davey Grant'}]}
  v={'category':'combat','date':'2026-11-08','title':'Elijah Smith vs Davey Grant | UFC KO Highlights'}
  self.assertTrue(m.exact_bout_video(v,bout))
  self.assertFalse(m.exact_bout_video({**v,'title':'Elijah Smith vs Someone Else'},bout))
  self.assertFalse(m.exact_bout_video({**v,'date':'2026-10-03'},bout))
  self.assertFalse(m.exact_bout_video(v,{**bout,'status':'pending'}))
 def test_results_link_only_when_both_names_match(self):
  entry={'id':'yt-AbCdEf12345','category':'combat','discipline':'MMA','title':'Grant vs Smith | UFC KO Highlights',
   'date':'2026-11-08','url':'https://www.youtube.com/watch?v=AbCdEf12345','publisher':'UFC',
   'isFinish':True,'source':'Verified publisher YouTube upload feed',
   'auAvailable':True,'auVerification':'youtube-country-metadata',
   'auVerifiedAt':'2026-11-08T02:00:00Z',
   'thumbnail':'https://i.ytimg.com/vi/AbCdEf12345/mqdefault.jpg'}
  film={'videos':[]}
  results={'results':[{'sport':'MMA','status':'completed','date':'2026-11-07',
   'fighters':[{'name':'Davey Grant'},{'name':'Elijah Smith'}]}]}
  self.assertEqual(m.merge_video(film,results,[entry]),(1,1))
  self.assertEqual(m.merge_video(film,results,[entry]),(0,0))
  self.assertEqual(results['results'][0]['highlights']['publisher'],'UFC')

class VideoDisciplineScopeTests(unittest.TestCase):
 def test_official_mma_and_grappling_are_separated(self):
  self.assertEqual(m.video_sport({'publisher':'UFC','title':'UFC BJJ 14 submission highlights','category':'combat','discipline':'MMA'}),'grappling')
  self.assertEqual(m.video_sport({'publisher':'UFC','title':'UFC 334 KO highlights','category':'combat','discipline':'MMA'}),'mma')
  self.assertEqual(m.video_sport({'publisher':'PFL','title':'PFL knockout highlights','category':'combat','discipline':'MMA'}),'mma')
  self.assertEqual(m.video_sport({'publisher':'ONE Championship','title':'ONE MMA world title fight highlights','category':'combat','discipline':'MMA / Grappling'}),'mma')
  self.assertEqual(m.video_sport({'publisher':'ONE Championship','title':'ONE BJJ submission grappling highlights','category':'combat','discipline':'MMA / Grappling'}),'grappling')
 def test_striking_only_one_uploads_are_excluded(self):
  self.assertIsNone(m.video_sport({'publisher':'ONE Championship','title':'ONE Muay Thai knockouts highlights','category':'combat','discipline':'MMA / Grappling'}))
  self.assertIsNone(m.video_sport({'publisher':'ONE Championship','title':'ONE Fight Night 49 Highlights','category':'combat','discipline':'MMA / Grappling'}))
 def test_rizin_kickboxing_not_mislabeled_mma(self):
  self.assertIsNone(m.video_sport({'publisher':'RIZIN Fighting Federation','title':'RIZIN kickboxing fight highlights','category':'combat','discipline':'MMA'}))
 def test_wrestling_rights_holder_and_bjj(self):
  self.assertEqual(m.video_sport({'publisher':'United World Wrestling','title':'Greco-Roman wrestling finals highlights','category':'combat','discipline':'Wrestling / RAF'}),'grappling')
  self.assertEqual(m.video_sport({'publisher':'FloGrappling','title':'ADCC finals submission highlights','category':'combat','discipline':'BJJ / Grappling'}),'grappling')

 def test_knocks_out_titles_count_as_finishes(self):
  self.assertTrue(m.qualifies('Navajo Stirling knocks out Jiri Prochazka','MMA'))
  self.assertEqual(m.video_kind('Stirling knocked out Prochazka in round 2'),'KO / TKO')
 def test_finish_searches_cover_recent_stoppages_only(self):
  today=dt.date(2026,11,25)
  row=lambda d,ev,sp,winner,method:{'sport':sp,'date':d,'event':ev,'winner':0,'method':method,'fighters':[{'name':winner},{'name':'Loser'}]}
  res={'results':[row('2026-11-21','UFC Fight Night: A vs B','MMA','Navajo Stirling','KO/TKO (punch)'),
   row('2026-11-21','UFC Fight Night: A vs B','MMA','Decision Guy','Decision (unanimous)'),
   row('2026-11-18','Matchroom','Boxing','Ky Hodgson','TKO'),
   row('2026-10-01','UFC 999','MMA','Old Winner','KO'),
   row('2026-11-14','Unknown Promotion','MMA','Nobody','KO')]}
  out=m.finish_searches(res,today)
  self.assertEqual([(c[0],q) for c,q in out],[('UFC','Navajo Stirling knockout'),('DAZN Boxing','Ky Hodgson knockout'),('Top Rank Boxing','Ky Hodgson knockout')])
  self.assertLessEqual(len(m.finish_searches({'results':[row('2026-11-21','UFC X','MMA','W%d'%i,'KO') for i in range(60)]},today)),m.MAX_SEARCHES)
 def test_refresh_searches_and_rechecks_recent_clips(self):
  today=dt.date(2026,11,25)
  seen={'search':[],'verified':[]}
  def search(ch,q):
   seen['search'].append((ch,q));return ''
  def verify(v):
   seen['verified'].append(v['id']);return dict(v,auAvailable=True,auVerification='youtube-api-region-restriction',auVerifiedAt='2026-11-25T00:00:00Z')
  old={'id':'yt-DSGCMCD7cEM','category':'combat','discipline':'MMA','title':'BEAUTIFUL KNEE KNOCKOUT #ufcqatar','url':'https://www.youtube.com/watch?v=DSGCMCD7cEM','thumbnail':'https://i.ytimg.com/vi/DSGCMCD7cEM/hq.jpg','publisher':'UFC','date':'2026-11-21','verified':True,'kind':'KO / TKO','isFinish':True,'sport':'mma','auAvailable':True,'auVerification':'youtube-api-region-restriction','auVerifiedAt':'2026-11-21T15:47:41Z'}
  stale={'id':'yt-OLDOLDOLD00','url':'https://www.youtube.com/watch?v=OLDOLDOLD00','date':'2026-09-01','title':'old','thumbnail':'x'}
  film={'videos':[old,stale]}
  res={'results':[{'sport':'MMA','date':'2026-11-21','event':'UFC Fight Night: A vs B','winner':0,'method':'KO/TKO (knee)','fighters':[{'name':'John Mitchell'},{'name':'Loser'}]}]}
  def fetch(channel):raise ValueError('offline')
  m.refresh(film,res,fetch=fetch,today=today,verify=verify,check_shorts=False,search=search)
  self.assertIn('yt-DSGCMCD7cEM',seen['verified'],'a recent clip is re-verified even when it left the channel list')
  self.assertNotIn('yt-OLDOLDOLD00',seen['verified'],'clips older than 21 days are not')
  self.assertEqual([q for _,q in seen['search']],['John Mitchell knockout'])
  self.assertEqual([v for v in film['videos'] if v['id']=='yt-DSGCMCD7cEM'][0]['auVerifiedAt'],'2026-11-25T00:00:00Z')

if __name__=='__main__': unittest.main()
