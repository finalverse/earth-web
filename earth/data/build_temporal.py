"""Reproduce an offline immutable USGS provider from an explicitly acquired source."""
import hashlib,json,sys
from pathlib import Path
from datetime import datetime,timezone,timedelta
source=Path(sys.argv[1]) if len(sys.argv)>1 else Path(__file__).parent/'sources/usgs-ridgecrest-2019.geojson'; raw=source.read_bytes()
EXPECTED='ad3bdcf88e25e723a0c6fcc01703d9aaa626392bcb8dc8bffbee72b597f0135d'
if hashlib.sha256(raw).hexdigest()!=EXPECTED: raise ValueError('Review changed USGS source before updating the pin')
doc=json.loads(raw)
url='https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=2019-07-04T00:00:00&endtime=2019-07-08T00:00:00&minlatitude=35&maxlatitude=37&minlongitude=-119&maxlongitude=-116&minmagnitude=4&orderby=time-asc&limit=500'
def iso(ms): return datetime.fromtimestamp(ms/1000,timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
features=[];obs=[]
ingested_at='2026-10-19T03:22:41.234Z' # acquisition/build record, not an event or observation time
for f in doc['features']:
 p=f['properties']; t=iso(p['time'])
 features.append({'type':'Feature','id':f['id'],'properties':{'name':p['title'],'magnitude':p['mag'],'magnitude_type':p['magType'],'depth_km':f['geometry']['coordinates'][2],'event_at':t,'catalog_updated_at':iso(p['updated']),'source_url':p['url'],'network':p['net']},'geometry':{'type':'Point','coordinates':f['geometry']['coordinates'][:2]}})
 obs.append({'id':f['id']+'-magnitude','feature_id':f['id'],'field':'magnitude','value':p['mag'],'interval':{'start':t,'end':iso(p['time']+1)},'event_at':t,'observed_at':None,'valid_interval':None,'ingested_at':ingested_at,'source':p['url']})
temporal={'schema_version':1,'kind':'historical_observation','time_basis':'event_time','fields':[{'id':'magnitude','title':'Catalog event magnitude','units':'source magnitude scale; see magnitude_type'}],'observations':obs,'explanation':'USGS preferred catalog solutions acquired in 2026 for July 2019 events. Origin time is event time; sensor observation time is unavailable. Catalog update is not event time. Not the catalog as it was known in 2019, not a forecast or live alert. Mixed magnitude scales must not be treated as earthquake energy.'}
dataset={'id':'usgs-ridgecrest-2019','version':'usgs-2019-archive-'+EXPECTED[:12],'title':'Ridgecrest earthquake sequence · July 2019 · M ≥ 4','visibility':'public','features':features,'temporal':temporal,'provenance':{'source':url,'source_sha256':EXPECTED,'content_sha256':hashlib.sha256(json.dumps({'features':features,'temporal':temporal},separators=(',',':'),ensure_ascii=False).encode()).hexdigest(),'content_hash_scope':'Selected features and temporal observations, compact UTF-8 JSON','license':'USGS public-domain data','license_url':'https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits','attribution':'U.S. Geological Survey Earthquake Hazards Program and contributing seismic networks (USGS ComCat)','crs':'OGC:CRS84','units':'degrees; source magnitude; depth in km (properties only)','modifications':'Bounded archived catalog query. Point Z depth moved to depth_km; no fabricated ground altitude. Source IDs, magnitudes and origin instants retained.','time':{'kind':'historical_observation','event_range':{'start':'2019-07-04T00:00:00.000Z','end':'2019-07-08T00:00:00.000Z'},'ingested_at':ingested_at,'observed_at':None},'quality':temporal['explanation']}}
directory=Path(sys.argv[2]) if len(sys.argv)>2 else Path(__file__).parent
directory.mkdir(parents=True,exist_ok=True)
out=directory/'usgs-ridgecrest.json'; b=(json.dumps(dataset,separators=(',',':'),ensure_ascii=False)+'\n').encode();out.write_bytes(b)
lock=directory/'temporal.lock.json';lock.write_text(json.dumps({'schema_version':1,'files':{'usgs-ridgecrest.json':hashlib.sha256(b).hexdigest()},'source_sha256':EXPECTED,'source_url':url},indent=2)+'\n')
print(len(features),'events; source and output checksummed')
