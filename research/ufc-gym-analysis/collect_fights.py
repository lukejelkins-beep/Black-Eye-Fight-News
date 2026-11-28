import re,json,time,sys,urllib.request
from bs4 import BeautifulSoup
UA={"User-Agent":"Mozilla/5.0"}
def get(u):
    for a in range(3):
        try:
            return urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=30).read().decode("utf8","ignore")
        except Exception as e:
            time.sleep(2)
    return ""
Y=sys.argv[1]
org=BeautifulSoup(get("https://www.sherdog.com/organizations/Ultimate-Fighting-Championship-2/recent-events/1"),"lxml")
evs=[]
for tr in org.select("tr[itemtype]"):
    d=tr.select_one('meta[itemprop=startDate]'); a=tr.select_one('a[itemprop=url]')
    if d and a and d["content"].startswith(Y): evs.append((d["content"][:10],a["href"],a.get_text(strip=True)))
print(len(evs),"events",flush=True)
fights=[]
for d,href,name in sorted(evs):
    s=BeautifulSoup(get("https://www.sherdog.com"+href),"lxml")
    # main event
    fc=s.select_one(".fight_card")
    def side(el):
        a=el.select_one("a[href*='/fighter/']"); r=el.select_one(".final_result")
        return (a["href"] if a else None, el.select_one("h3 span, [itemprop=name]").get_text(" ",strip=True) if el.select_one("[itemprop=name]") else "", r.get_text(strip=True) if r else "")
    rows=[]
    if fc:
        l=fc.select_one(".fighter.left_side"); r=fc.select_one(".fighter.right_side")
        m=s.select_one(".fight_card_resume")
        meth=""
        if m:
            t=m.get_text(" ",strip=True); mm=re.search(r"Method\s*(.*?)\s*Referee",t); meth=mm.group(1) if mm else ""
        wc=fc.select_one(".weight_class")
        rows.append((side(l),side(r),meth,wc.get_text(strip=True) if wc else ""))
    for tr in s.select("table.new_table.result tr[itemprop=subEvent]"):
        fl=tr.select(".fighter_list")
        if len(fl)<2: continue
        tds=tr.find_all("td")
        meth=tds[4].get_text(" ",strip=True) if len(tds)>4 else ""
        wc=tr.select_one(".weight_class")
        rows.append((side(fl[0]),side(fl[1]),meth,wc.get_text(strip=True) if wc else ""))
    for (a,b,meth,wc) in rows:
        fights.append(dict(date=d,event=name,a_url=a[0],a=a[1],a_res=a[2],b_url=b[0],b=b[1],b_res=b[2],method=meth,wc=wc))
    print(d,name,len(rows),flush=True); time.sleep(0.8)
json.dump(fights,open(f"fights_{Y}.json","w"),indent=1)
print(len(fights),"fights")
