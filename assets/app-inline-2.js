/* International Combat Sports — static public-web prototype. No fabricated live data. */
(()=>{
'use strict';
const D=window.COMBAT_DATA;
// Public-display clean-up of fighter records. The data file is refreshed by
// bots, so fix at load: an archived list ranking ("#9", "Outside top 15") or a
// research placeholder ("Record: consult linked ledger") is never shown as a
// pro record. Use the sourced "Professional: W-L(-D)" line when present.
(function cleanFighterRecords(){
 const rankLike=/^(#\d+|Outside\b.*\btop\s*\d+)/i,placeholder=/^Record:/i;
 for(const f of D.fighters||[]){
  let r=String(f.record||'').trim();
  if(rankLike.test(r)||placeholder.test(r)){
   if(rankLike.test(r))f.archivedListRank=r;
   const m=String(f.meta||'').match(/Professional:\s*(\d{1,3})\s*[-–]\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?/i);
   r=m?[m[1],m[2],m[3]].filter(x=>x!==undefined).join('–'):'';
  }
  f.record=r.replace(/(\d)\s*-\s*(\d)/g,'$1–$2');
 }
})();
const main=document.querySelector('#main');
const dialog=document.querySelector('#fighterDialog');
if(!D||!main){if(main) main.textContent='Fight data unavailable. Please refresh the page.';return;}
const fightDesk=window.BEFNFightsUI={view:'upcoming',promotion:'ufc',query:''};
const state={news:'boxing',champions:'boxing',fightersSport:'Boxing',fightersCategory:'All',fightersDivision:'All',fightersQuery:'',social:'all',talkPromotion:'all',talkFighter:'',socialMode:'latest',socialPlatform:'all',socialPage:1,talkRole:'all',talkSort:'balanced',calendar:'boxing',highlights:'boxing'};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeURL=x=>{if(/^assets\/img\/[a-z0-9-]+\/[a-z0-9-]+\.webp$/.test(String(x)))return esc(x);try{const u=new URL(x);return u.protocol==='https:'?esc(u.href):'#'}catch(_){return '#'}};
const domain=x=>{try{return new URL(x).hostname.replace(/^www\./,'')}catch{return 'Source'}};
const short=x=>String(x||'').length>215?String(x).slice(0,212)+'…':String(x||'');
const normalizePortraitName=name=>String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[‘’]/g,"'").trim();
const knownPortraits=new Map(Object.entries({"Teremoana Teremoana":"https://www.matchroomboxing.com/app/uploads/2024/12/BigT.jpg","Bakhodir Jalolov":"https://www.sports.kz/upload/2025-11/690a5ff793a9b.jpg","Richard Torrez Jr.":"https://cdn.prod.website-files.com/6654c88f22981ae93116a799/67bfd79c3321e260dad5d277_Richard_Torrez_Heavyweight_Boxing.webp","David Nyika":"https://images.ctfassets.net/lg76kxmf55ue/1LHKxoZyb8dmtTN96DE77e/6ae86a4b8d37270977d8da5dddf5e06b/DavidNyika.png?fm=webp&q=80&w=1920","Pat Brown":"https://www.matchroomboxing.com/app/uploads/2024/11/Pat-Brown-Hero.png","Ben Whittaker":"https://www.matchroomboxing.com/app/uploads/2025/10/Be-wHITTAKER-BANNER_.png","Imam Khataev":"https://images.ctfassets.net/lg76kxmf55ue/2ayAZHEcFcNylHEDaWwHIS/c1e467b190301056c9b3e8d35bd2848d/khataev_flex_6777545077.jpeg?fm=webp&q=80&w=1920","Najee Lopez":"https://photo.boxingscene.com/uploads/NajeeLopez.jpg","Wilkens Mathieu":"https://images.ctfassets.net/lg76kxmf55ue/3UoTPw74bhZqoyjcRLfux2/2cf4a7d323ea20828f67835953fd71ce/WilkensMathieu.png","Elijah Garcia":"https://photo.boxingscene.com/uploads/elijah-garcia-1.jpg","George Liddard":"https://www.matchroomboxing.com/app/uploads/2023/01/Liddard-2000x2000.png","Charles Conwell":"https://media.tycsports.com/files/2020/10/05/124190/charles-conwell.jpg","Bakary Samake":"https://cdn.prod.website-files.com/677a760f8084966769f9d49c/6881f96efcdd0f348c0b6e25_bakary-samake-saulo-morales-boxe.jpg","Rohan Polanco":"https://ringside24.com/media/post/8YgNMscreenshot7_slug.jpg","Adam Azim":"https://images.ctfassets.net/lg76kxmf55ue/3b9jAMrrlcSZEv2jJdLSeA/9c3ee2ac38310821dec2285c883587d2/adam_azim_5ccbdf1eec.jpg?fm=webp&q=80&w=1920","Sam Noakes":"https://images.ctfassets.net/lg76kxmf55ue/1Uj3JLHPiFzgkN3FBdsEnx/8ecbe63db4a5f9c0b5e20746a5c8afd0/Sam-Noakes.png?w=400&q=80&fm=webp","Omar Trinidad":"https://photo.boxingscene.com/uploads/OmarTrinidad_MikePlania.jpg","Albert Gonzalez":"https://ringside24.com/media/post/big_s8tBHscreenshot5_slug.jpg","Mikito Nakano":"https://images.ctfassets.net/lg76kxmf55ue/4Y5a3eGvSmnQy5ldBjlFNz/d60c9db5b28b9711acf6340eda950e0a/MikitoNakano.png","Bryan Mercado":"https://images.ctfassets.net/lg76kxmf55ue/5ydi4SRuwonXb4ZtLPNp8H/c9ad3aecb7e182fe1a56da1cb0929f12/ring_magazine_dev_ring_old_data_uploads_2024_02_bryan_mercado_1edf33dbb7.jpeg","Moses Itauma":"https://images.ctfassets.net/lg76kxmf55ue/2RVRmmhnh0lFm8n2QWqvzV/7fa0e3d08f71a776c92657926329fd9c/moses_itauma_1_fad98d8eee.jpg","Viddal Riley":"https://static.independent.co.uk/2025/04/15/16/51/GettyImages-2128017100.jpg","Diego Pacheco":"https://images.ctfassets.net/lg76kxmf55ue/72mfrtEJa3ih5qLj3exGtN/f889ac2f29d1357f40356971723221fc/pacheco_sadjo2_329f3efac3.jpeg","Callum Simpson":"https://res.cloudinary.com/ybmedia/image/upload/c_crop%2Ce_improve%2Ch_1333%2Cw_2000%2Cx_0%2Cy_11/c_fill%2Cf_auto%2Ch_1200%2Cq_auto%2Cw_1600/v1/m/b/0/b0ba7753efa5cda85ed1370f30102bcc0548a55e/callum-simpson-vs-ivan-zucco-preview-betting-odds.jpg","Yoenli Hernandez":"https://images.ctfassets.net/lg76kxmf55ue/4X9WO9RlE2WmaIorkgtlCr/401ee8f15367a99243d395cd2b8e6701/YoenliHernandez.png?fm=webp&q=80&w=1920","Vito Mielnicki Jr.":"https://photo.boxingscene.com/uploads/Vito-Mielnicki-Jr_mic2.jpg","Vergil Ortiz Jr.":"https://e01-phantom-marca-us.uecdn.es/1ddff8cb3fadccc682cf8bfa0d3f3359/resize/828/f/jpg/assets/multimedia/imagenes/2025/08/16/17553280506100.jpg","Conah Walker":"https://cdn.antaranews.com/cache/1200x800/2025/06/22/IMG_20250622_103640.jpg","Giovani Santillan":"https://api.toprank.com/storage/uploads/756/conversions/Giovani-Santillan_25-05-08_0005-min-thumb.webp","Andy Hiraoka":"https://www.nikkansports.com/battle/news/img/202409030001263-w1300_0.jpg","Emiliano Vargas":"https://www.boxingnews24.com/wp-content/uploads/2024/09/Emiliano-Fernando-Vargas-vs-Larry-Fryers_action1.jpg","Andy Cruz":"https://e01-phantom-marca-us.uecdn.es/15d039d003844ab0d866ce310963caa1/crop/0x0/1978x1318/resize/1200/f/webp/assets/multimedia/imagenes/2025/06/15/17500158024067.jpg","Jadier Herrera":"https://ringside24.com/media/post/big_qgyXejadier-herrera-vs-andres-navarrete-1_slug.jpg","Andres Cortes":"https://notifight.com/download/multimedia.normal.83ae76f32909f140.bm9ybWFsLndlYnA%3D.webp","Charly Suarez":"https://od2-image-api.abs-cbn.com/prod/editorImage/1747557875586IMG_9989.jpeg","Liam Wilson":"https://content.api.news/v3/images/bin/207e45733abfbafc7908a8fc373215c7","Sam Goodman":"https://content.api.news/v3/images/bin/007c29789476f57f9deeacb42f8edb09","Ramon Cardenas":"https://www.ringmagazine.com/_next/image?q=75&url=https%3A%2F%2Fimages.ctfassets.net%2Flg76kxmf55ue%2F5gLZcWhPgwi1SpyYNkKcyo%2F6ed603e348d4e9ef21ff0ef904abead3%2FRamonCardenas.png%3Fw%3D1920%26q%3D80%26fm%3Dwebp&w=3840","Tenshin Nasukawa":"https://image.news.livedoor.com/newsimage/stf/0/f/0f257_1588_1979295c_00bacdd7.jpg","Jovan Leka":"https://a.espncdn.com/combiner/i?img=%2Fi%2Fheadshots%2Fmma%2Fplayers%2Ffull%2F5312090.png","Muhammad Saidov":"https://cdn.sekbernews.id/media/images/2026/07/BhcFBs5aLa.jpeg?height=674&location=1&quality=80&watermark=1&width=1200","Abdul Rakhman Yakhyaev":"https://cagelore.com/images/uploads/1978db80-8dab-443f-afeb-621851b167f0","Iwo Baraniewski":"https://gidstats.ru/img/fighters/0/0/1-2537.png","Zhang Mingyang":"https://x0.ifengimg.com/res/2024/5F6E5867165A131AC4818D7131434F1250659C2A_size212_w1024_h701.jpg","Bo Nickal":"https://a.espncdn.com/i/headshots/mma/players/full/5061870.png","Ateba Gautier":"https://eu-images.contentstack.com/v3/assets/blta90d05ad41a54a71/blt9c0a157aa84f4fd4/6a01eca99da19ede71c420f2/Ateba.png","Jacobe Smith":"https://d33t2v9cbr12gb.cloudfront.net/fighters/5b1a1df179131cb7df13c2ea16d78e8d30c50883b08df8661ff3255e96151495.webp","Daniil Donchenko":"https://gidstats.com/img/fighters/0/0/1-2495.png","Tom Nolan":"https://gidstats.com/img/fighters/0/0/1-1811.png","Mauricio Ruffy":"https://static.wixstatic.com/media/668b59_6d00603e82594cfbbed28f0933a8d726~mv2.jpg/v1/fill/w_768%2Ch_512%2Cal_c/668b59_6d00603e82594cfbbed28f0933a8d726~mv2.jpg","Nazim Sadykhov":"https://1news.az/images/2024/06/09/20240609054926727/thumb.jpg","Matheus Camilo":"https://gidstats.com/img/fighters/0/0/1-2069.png","Gabriel Santos":"https://www.opovo.com.br/_midias/jpg/2023/01/27/800x600/1_gabriel_santos_mma-20938057.jpg","Raul Rosas Jr.":"https://primesworld.com/wp-content/uploads/Some-Lesser-Known-Facts-About-Raul-Rosas-Jr.png","Cody Haddon":"https://perthisok.com/_next/image/?q=75&url=https%3A%2F%2Fcms.perthisok.com%2Fwp-content%2Fuploads%2F2024%2F10%2Fcody-haddon-ufc-debut-las-vegas.jpg&w=3840","Rinya Nakamura":"https://staticg.sportskeeda.com/editor/2024/02/1bd56-17079832440445-1920.jpg?w=640","Ethyn Ewing":"https://gidstats.ru/img/fighters/0/0/1-2869.png","Lone’er Kavanagh":"https://www.mmaweekly.com/.image/Mjk6MDAwMDAwMDAwMTExNzQy/loneer-kavanagh.png?profile=share16-9","Ramazan Temirov":"https://pbs.twimg.com/media/HN078ambsAAlarU.jpg","Bilal Hasan":"https://arena.inilah.com/_next/image?q=75&url=https%3A%2F%2Fc.inilah.com%2Freborn%2F2026%2F08%2FProfil_Bilal_Hasan_2882a12b25.jpg&w=1200","Marcos Degli":"https://cdn.gidstats.com/img/fighters/0/0/1-2239.png","Jose Ochoa":"https://gidstats.com/img/fighters/460/700/1-2436.png","Regina Tarin":"https://img.asmedia.epimg.net/resizer/v2/TXMGMJYY6FB3LGTFS2VC7NSZAU.jpg?auth=f3d9b0545dbde428f63a96a97c2ca8315f63e5fe6b8991cbd13e5a5ddcce5d23&height=1104&smart=true&width=1472","Gabriella Fernandes":"https://gidstats.com/img/fighters/0/0/1-1242.png","Eduarda Moura":"https://res.cloudinary.com/ybmedia/image/upload/c_crop%2Ce_improve%2Ch_1333%2Cw_2000%2Cx_0%2Cy_12/c_fill%2Cf_auto%2Ch_1200%2Cq_auto%2Cw_1600/v1/m/3/7/370e56a40b3e67e5600ed422734130d0a6435cca/ufc-fighter-eduarda-moura-diagnosed-bipolar.jpg","Tereza Bledá":"https://gidstats.com/img/fighters/0/0/1-1577.png","Michelle Montague":"https://gidstats.com/img/fighters/0/0/1-2508.png","Klaudia Syguła":"https://gidstats.com/img/fighters/0/0/1-2433.png","Daria Zhelezniakova":"https://img.championat.com/news/big/b/c/koryavenkaya-udarnica-darya-zheleznyakova-vyskazalas-o-predstoyaschej-sopernice-v-ufc_17273751701396309135.jpg","Nina Milošević":"https://www.superiorchallenge.com/wp-content/uploads/2023/09/Profilbild-fighter-Superior-Challenge-hemsida-Nina-Nikolija-Milosevic.png","Jaqueline Amorim":"https://www.lowkickmma.com/wp-content/uploads/2024/04/Jaqueline-Amorim-1.jpg","Stephanie Luciano":"https://gidstats.com/img/fighters/0/0/1-2359.png","Khamzat Chimaev":"https://sportshub.cbsistatic.com/i/2026/03/12/878463bf-26b3-4b06-8453-cd4c19ae24b9/khamzat-chimaev-ufc-328-sean-strickland-mma-cbs-sports-v2-march-12-2026.jpg","Michael Morales":"https://gidstats.com/img/fighters/0/0/2-829.png","Quillan Salkilld":"https://gidstats.com/img/fighters/0/0/2-1436.png","Arman Tsarukyan":"https://img.asmedia.epimg.net/resizer/v2/ORGSVZ56CCKS2TMPFF7VZQAYRY.jpg?auth=6d9249c60083a78803620dce1d4ad72df2460ceba317698b4801a7dd3e75259e&focal=2392%2C405&height=828&width=1472","Movsar Evloev":"https://img.championat.com/c/900x900/news/big/o/q/movsar-evloev-leron-myorfi_1773556305356109849.jpg","Merab Dvalishvili":"https://gidstats.com/img/fighters/0/0/1-520.png","Luana Santos":"https://gidstats.com/img/fighters/0/0/2-1112.png","Fatima Kline":"https://a.espncdn.com/i/headshots/mma/players/full/5028019.png","Shakur Stevenson":"https://a.espncdn.com/photo/2025/0128/09_shakur-stevenson.png","Jake Paul":"https://influencerboxingrec.com/img/boxers/jake-paul-boxer.png","Gabriel Rosado":"https://res.cloudinary.com/boxbid/image/upload/v1730143751/Gabriel%20Rosado/boxer/profile_image/auxr8hqyr2k40g180si6.png","Terence Crawford":"https://kitbagsandlockers.com/cdn/shop/collections/BioImage_Crawford_0.jpg?v=1709308529","Tyson Fury":"https://www.peoples.ru/sport/boxer/tyson_fury/fury_impls0kue31a1.jpeg","Artur Beterbiev":"https://a.espncdn.com/photo/2025/0128/04_artur-beterbiev.png","Richardson Hitchins":"https://photo.boxingscene.com/uploads/richardson-hitchins10_1695309135.jpg","Keyshawn Davis":"https://images.ctfassets.net/lg76kxmf55ue/2abTjRI9pQUWM6gNWoJIAb/2c32b380a7ce14e08062506c14a6c92a/KeyshawnDavis.png?w=400&q=75&fm=webp","Devin Haney":"https://a.espncdn.com/photo/2025/0128/devin-haney.png","Oleksandr Usyk":"https://a.espncdn.com/photo/2025/0128/01_oleksandr-usyk.png","Jaron Ennis":"https://photo.boxingscene.com/uploads/JaronBootsEnnisWithChainsPhotoSession.webp","Jaron “Boots” Ennis":"https://photo.boxingscene.com/uploads/JaronBootsEnnisWithChainsPhotoSession.webp","Ilia Topuria":"https://a.espncdn.com/i/headshots/mma/players/full/4350812.png","Dmitry Bivol":"https://www.matchroomboxing.com/app/uploads/2020/07/WhatsApp-Image-2021-05-20-at-13.38.01-e1621514875666-1000x627.jpeg","Jai Opetaia":"https://deweb-519a7.b-cdn.net/post-images/67dd703d-1d1c-48c1-bff5-ac92741c211e.png","Junto Nakatani":"https://images.ctfassets.net/lg76kxmf55ue/3RlBVTYMHnyqDQUM8jqGFH/041dd401e4c6e996c94bca91cc62b0d5/JuntoNakatani.png?fm=webp&q=80&w=400","Naoya Inoue":"https://commons.wikimedia.org/wiki/Special:FilePath/Naoya%20Inoue%2020260502.png","Daniel Dubois":"https://images.ctfassets.net/lg76kxmf55ue/5UCzIFTE59SMaBU9CWvDNF/02cf5fdad13d54f16357d1ba47128238/DanielDubois.png?fm=webp&q=80&w=1920","David Benavidez":"https://photo.boxingscene.com/uploads/david-benavidez_1701066162.jpg","Liam Paro":"https://images.daznservices.com/di/library/DAZN_News/4b/c/liam-paro09112024_1lgkuj9rhsnsi1pliwyz0jzuva.jpg?t=-1730303949","Anthony Cacace":"https://belfastmedia.com/uploads/article/2024/11/23737/0K8A9009.jpg?t=1731516436","Lauren Price":"https://images.ctfassets.net/lg76kxmf55ue/3B4AdvRKCwYzDqeEasqyOQ/66c63354ae2c702224d67ff3cb5b6b29/Lauren-Price.png?fm=webp&q=80&w=1920","Ciryl Gane":"https://gidstats.com/img/fighters/0/0/2-276.png","Tye Ruotolo":"https://staticg.sportskeeda.com/editor/2025/05/0e700-17464384967543-1920.jpg","Helena Crevar":"https://mmasucka.com/api/media/file/HelenaCrevar-5-scaled.webp","Spencer Lee":"https://res.cloudinary.com/usopc-prod/image/upload/c_scale%2Cw_1200/q_auto/f_auto/v1/NGB%20Wrestling/Athlete%20Action/SpencerLee-25FinalX-Gut-1200x800","Canelo Álvarez":"https://a.espncdn.com/photo/2025/0128/05_canelo-alvarez.png","Sean Strickland":"https://a.espncdn.com/i/headshots/mma/players/full/3093653.png","Murat Gassiev":"https://sportscovering.com/wp-content/uploads/2021/07/Murat-Gassiev.jpeg","Lenar Perez":"https://images.ctfassets.net/lg76kxmf55ue/2x6semsYdOejqYlJgSKPKp/215fc690c4b3f906f74baa0456b9d256/LenarPerez.png?fm=webp&q=80&w=400","Bek Nurmaganbet":"https://images.ctfassets.net/lg76kxmf55ue/56CUVjj3XVXlAp2f1X2i3w/c3464b93b3b7888d5ae0879d67a337ec/Bek_Nurmaganbet_169ed9badd.jpg","Jahi Tucker":"https://images.ctfassets.net/lg76kxmf55ue/6A4JE02xr6ZtAHYulkJfwl/d0463cb49b0571c5997ea79815bbd292/JahiTucker.png?fm=webp&q=80&w=400","Omari Jones":"https://res.cloudinary.com/usopc-prod/image/upload/v1685808231/NGB%20Boxing/Athlete%20Profiles/2023%20Elite/Bio%20podium%20photos/Jones_o_bio.png","Jalil Hackett":"https://images.ctfassets.net/lg76kxmf55ue/7kDjgS8jezpSDCR7Rs2eSq/08d9cc695c731644a06bd84141c0f801/jalill_hackett_e70d1e407b.jpg?fm=webp&q=80&w=500","Jhon Orobio":"https://images.ctfassets.net/lg76kxmf55ue/4K0tt6l7Y5KTjY1ASdFYky/9c87da4628d1cbf5827427c0d00f9ad6/JhonOrobio.png?fm=webp&q=80&w=400","Curmel Moton":"https://images.ctfassets.net/lg76kxmf55ue/2wUHcgDPtCgFRzzBJlaCE6/51dced003d21496730f621ef49edaf05/CurmelMoton.png?fm=webp&q=80&w=400","Giorgio Visioli":"https://www.matchroomboxing.com/app/uploads/2023/09/Visioli-2-2000x1403.jpg","Zaquin Moses":"https://images.ctfassets.net/lg76kxmf55ue/3ozH6x0hUz9lqCVuXtKfdQ/181f03a24dd5e88c245eff0836f9b64a/zaquin_moses_92e88adeb6.jpg?fm=webp&q=80&w=500","Royston Barney-Smith":"https://images.ctfassets.net/lg76kxmf55ue/7DvlqBjPEHEzm68ZM1DzmM/36c433442acf112b7cd1420ce9ff49a8/royston_barney_smith_9d8842121e.jpg","Sebastian Hernandez Reyes":"https://images.ctfassets.net/lg76kxmf55ue/5sBxFOxowqTPeWbmuS1s0Z/47918c0ca5054718cf9bc9ce531434d0/Sebastian-Hernandez.png?fm=webp&q=80&w=400","Fabio Wardley":"https://cdn1.secondsout.com/uploads/content/1716203674203534445/Wardley_main2.jpg","Joseph Parker":"https://ringside24.com/media/post/FVACUOaWAAMQfCh.jpg","Chris Billam-Smith":"https://photo.boxingscene.com/uploads/ChrisBillam-Smith1036.jpg","Robin Sirwan Safar":"https://images.ctfassets.net/lg76kxmf55ue/bv3a46TWZQgpeLJwhEZGc/897967fecdf2ef5a7b7344bec6fd5567/0be3019a-8c7c-4f78-b7ce-ae540f8b532e.jpeg?fm=webp&q=80&w=500","Katsuma Akitsugi":"https://photo.boxingscene.com/uploads/KatsumaAkitsugi.jpg","David Morrell Jr.":"https://wbaboxing.com/photos/boxers/david-morrelljr.jpg","Cristóbal Lorente":"https://images.ctfassets.net/lg76kxmf55ue/5NVxq1hqQ3mFpa7WLI1qrJ/d6b163de6f62286852510322b083ac12/CristobalLorente.png?fm=webp&q=80&w=400","Jason Moloney":"https://photo.boxingscene.com/uploads/jason-moloney-32.jpg","Otabek Kholmatov":"https://uzreport.news/fotobank/image/f474eccc4f7cb3bb9210db5f6fdca27b.jpeg","Jacob Bank":"https://photo.boxingscene.com/uploads/zeuge-smith-weights3.jpg","Freudis Rojas":"https://www.premierboxingchampions.com/sites/default/files/BioImage_Rojas.jpg","Ernesto Mercado":"https://images.ctfassets.net/lg76kxmf55ue/M3trUyOXS1YWwDuBrPUE4/6989f0a9bfa27069eba6462444264755/ErnestoMercado.png?fm=webp&q=80&w=400","Hayato Tsutsumi":"https://wbaboxing.com/photos/boxers/body-photos/hayato-tsutsumi.jpg","Angel Barrientes":"https://static.wixstatic.com/media/c0e6bf_e74c67dc3907405e8e63ed2ce9ea53b1~mv2.jpg/v1/fill/w_556%2Ch_420%2Cal_c%2Cq_80/c0e6bf_e74c67dc3907405e8e63ed2ce9ea53b1~mv2.jpg","Aoi Yokoyama":"https://nber.co.jp/wp-content/uploads/2024/12/IMG_7784-722x1024.jpeg","Jordy Adames":"https://lares.pr.gov/wp-content/uploads/Boxeo2025-822x1024.jpg","Willy Hutchinson":"https://images.ctfassets.net/lg76kxmf55ue/72VAKCq7719bsL7m37U4Oa/0fc23b2e3eb6c8a6b74c6268929ac1d5/willy_hutchinson_ad49856374.jpg?fm=webp&q=80&w=500","Kévin Lele Sadjo":"https://images.ctfassets.net/lg76kxmf55ue/4V4y9IbUbmC8klyullAwxW/50a86b94a1d6754dfbddaa84cdd3dc20/KevinLeleSadjo.png?fm=webp&q=80&w=400","Tim Tszyu":"https://www.premierboxingchampions.com/sites/default/files/BioImage_Tszyu.jpg","Israil Madrimov":"https://images.ctfassets.net/lg76kxmf55ue/7h5Sx5Hl4isQB29HWgrHGv/caaa35e992fca4a51beaff9b792fdb20/IsrailMadrimov.png","Callum Walsh":"https://images2.minutemediacdn.com/image/upload/c_crop%2Cw_5678%2Ch_3193%2Cx_635%2Cy_74/v1755632282/images/voltaxMediaLibrary/mmsport/boxing/01k31xd8dj06t6snsgrx.jpg","Shakhram Giyasov":"https://images.ctfassets.net/lg76kxmf55ue/lOYRNOUP0vc1Zxhc4Jq13/0a30871c871681981b94d30da5bcb1d5/ShakhramGiyasov.png?fm=webp&q=80&w=400","Lindolfo Delgado":"https://assets.izquierdazo.com/__export/1779938561809/sites/izquierdazo/img/2026/05/28/lindolfo-delgado.png_1671281443.png","Lamont Roach Jr.":"https://cdn.prod.website-files.com/677a760f8084966769f9d49c/6899c41668826a01a1ffae61_lamont%20roach%20jr.jpg","Mirco Cuello":"https://assets.dev-filo.dift.io/img/2025/08/09/10000241419043_sq.jpg","Andrew Cain":"https://queensberry.co.uk/cdn/shop/files/Andrew-Cain-1.png?v=1725960387","Joshua Buatsi":"https://images.ctfassets.net/lg76kxmf55ue/6nqBdM1SC4Mhsnfmby6gBo/91343238456e2f6aa4d2e0bf258226d3/JoshuaBuatsi.png?fm=webp&q=80&w=600","Tom Aspinall":"https://a.espncdn.com/i/headshots/mma/players/full/4010976.png","Magomed Ankalaev":"https://a.espncdn.com/i/headshots/mma/players/full/4273399.png","Alexander Volkov":"https://a.espncdn.com/i/headshots/mma/players/full/2993650.png","Dricus du Plessis":"https://a.espncdn.com/i/headshots/mma/players/full/3166126.png","Carlos Prates":"https://a.espncdn.com/i/headshots/mma/players/full/4294832.png","Ian Machado Garry":"https://a.espncdn.com/i/headshots/mma/players/full/4738092.png","Jiří Procházka":"https://a.espncdn.com/i/headshots/mma/players/full/3156612.png","Valentina Shevchenko":"https://a.espncdn.com/i/headshots/mma/players/full/2554705.png","Zhang Weili":"https://x0.ifengimg.com/ucms/2022_47/9B23BFFF8182B4C522C66256D656C8B35822B270_size79_w1026_h847.jpg","Diego Lopes":"https://a.espncdn.com/i/headshots/mma/players/full/4881999.png","Song Yadong":"https://a.espncdn.com/i/headshots/mma/players/full/3151289.png","Alexandre Pantoja":"https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2023-12/PANTOJA_ALEXANDRE_L_12-16.png?itok=KUFPMuog","Agit Kabayel":"https://cdn.prod.website-files.com/6654c88f22981ae93116a799/68eff040b43aef25285fcee3_Agit-Kabayel-Kurdish-German.webp","Filip Hrgović":"https://queensberry.co.uk/cdn/shop/files/Filip-Hrgovic_3.png?v=1757673148","Michał Cieślak":"https://gotowinasport.sts.pl/wp-content/uploads/2023/04/michal-cieslak-1.png","Erislandy Lara":"https://www.premierboxingchampions.com/sites/default/files/BioImage_Lara.jpg","Osleys Iglesias":"https://boxrec.com/wiki/thumb.php?f=OsleysIglesias_profile.jpg&width=500","Carlos Adames":"https://staticg.sportskeeda.com/editor/2025/02/ca751-17401437510822-1920.jpg","Josh Kelly":"https://cdn-img.boxingnewsonline.net/uploads/josh-kelly-5.webp","Teófimo López":"https://a4.espncdn.com/combiner/i?img=%2Fphoto%2F2021%2F0109%2Fr799831_1296x729_16-9.jpg","Ryan Garcia":"https://img.asmedia.epimg.net/resizer/v2/7NWDNHXY5JZGCIFSDRW5F3XEHU.jpg?auth=66d02987687f8f212a874c6b35bad150012d8ee0466b5ea9f014d1b169df1f1f&focal=3786%2C967&height=1200&width=1200","Gary Antuanne Russell":"https://www.origin.premierboxingchampions.com/sites/default/files/BioImage_Antuanne.jpg","Floyd Schofield":"https://images.ctfassets.net/lg76kxmf55ue/7gnB6CcQU1ueKNWLP59n0J/7544a39f618853467fe4812f3bcdf4c7/FloydSchofield.png?w=1920&q=80&fm=webp","Bruce Carrington":"https://images.ctfassets.net/lg76kxmf55ue/4OQEVrH56YpcNyczT9R12z/1c5f8420f863ae4e824fdc57f32d94ba/BruceCarrington.png?fm=webp&q=80&w=1920","Angelo Leo":"https://images.ctfassets.net/lg76kxmf55ue/7rpGpqMpry7CnJooTqKsA8/2649a1afa290b17dd9670a98bd767b7d/AngeloLeo.png?w=1920&q=80&fm=webp","Abdullah Mason":"https://photo.boxingscene.com/uploads/abdullah-mason_1688073289.jpg","Rafael Espinoza":"https://ringside24.com/media/post/big_Fl4NEscreenshot4_slug.jpg","Jesse Rodríguez":"https://images.ctfassets.net/lg76kxmf55ue/ZAWDmPo6fcKm4jPxrWNR9/882d695609a0ac8436e47c27b6f13ada/GettyImages-2247997003.jpg?w=1920&q=80&fm=webp","José Salas Reyes":"https://ringside24.com/media/post/KEnbrscreenshot4_slug.jpg","William Zepeda":"https://ringside24.com/media/post/l7U7Iscreenshot2_slug.jpg","Mario Pinto":"https://cdn.gidstats.com/img/fighters/0/0/1-2465.png","Tallison Teixeira":"https://gidstats.ru/img/fighters/0/0/2-1554.png","Billy Elekana":"https://gidstats.com/img/fighters/0/0/2-1559.png","Ikram Aliskerov":"https://img.championat.com/news/big/a/q/ikram-aliskerov-sleduyuschij-boj-eto-sbyvshayasya-mechta_1718348938632079307.jpg","Gabriel Bonfim":"https://a.espncdn.com/i/headshots/mma/players/full/4921516.png","Joe Pyfer":"https://dmxg5wxfqgb4u.cloudfront.net/styles/inline/s3/2024-02/GettyImages-1723327622.jpg?itok=oqoDMOt1","Tatsuro Taira":"https://images.inkl.com/s3/article/lead_image/20658756/Tatsuro-Taira-ufc-on-espn-58-media-day-scaled.jpg","Donte Johnson":"https://gidstats.com/img/fighters/0/0/2-1523.png","Bia Mesquita":"https://gidstats.com/img/fighters/0/0/1-2519.png","Carli Judice":"https://gidstats.com/img/fighters/0/0/1-2310.png","Youssef Zalal":"https://gidstats.ru/img/fighters/0/0/1-149.png","Alexia Thainara":"https://cdn.gidstats.com/img/fighters/0/0/1-2469.png","Payton Talbott":"https://dmxg5wxfqgb4u.cloudfront.net/styles/background_image_sm/s3/2024-06/062324-hero-payton-talbott_GettyImages-2108282642.jpg?h=d1cb525d&itok=OPDN7Hqy","Rodrigo Sezinando":"https://dmxg5wxfqgb4u.cloudfront.net/styles/background_image_sm/s3/2025-05/Rodrigo_Sezinando_20250212_CU_0030_0.jpg?h=d1cb525d&itok=gCdByoUT","Jaime Munguía":"https://commons.wikimedia.org/wiki/Special:FilePath/Jaime%20Munguia%20(cropped).jpg","Aaron McKenna":"https://img2.thejournal.ie/article/7054163/river?version=7054232&width=650","Sebastian Fundora":"https://www.premierboxingchampions.com/sites/default/files/BioImage_Fundora_0.jpg","Dalton Smith":"https://images.ctfassets.net/lg76kxmf55ue/24VjqXqTuyYyHLV54ir1pe/74812fad0237a5ee69815e7c62c276ea/dalton_smith_2_1280x898_9a63544884.jpg","O’Shaquie Foster":"https://d1ij03ghzlx1bo.cloudfront.net/8785041b-1dd1-4b8b-a89b-5e065a5a9f10.jpeg","Takuma Inoue":"https://www.nikkansports.com/battle/news/img/202111100000573-w1300_2.jpg","Christian Medina":"https://www.matchroomboxing.com/app/uploads/2026/01/Medina-Hero-Feb-2.png","Carlos Ulberg":"https://mma-compass.com/static/images/profilepictures/fullbody/9014c02eff8b3d62.png","Islam Makhachev":"https://a.espncdn.com/i/headshots/mma/players/full/3332412.png","Justin Gaethje":"https://a.espncdn.com/i/headshots/mma/players/full/3022345.png","Petr Yan":"https://a.espncdn.com/i/headshots/mma/players/full/4293517.png","Joshua Van":"https://a.espncdn.com/i/headshots/mma/players/full/5120301.png","Kayla Harrison":"https://a.espncdn.com/i/headshots/mma/players/full/4332765.png","Natália Silva":"https://a.espncdn.com/i/headshots/mma/players/full/4054605.png","Mackenzie Dern":"https://a.espncdn.com/i/headshots/mma/players/full/4021217.png","Vitor Petrino":"https://a.espncdn.com/i/headshots/mma/players/full/5060483.png","Allen Frye Jr.":"https://www.ufc-fr.com/data/combattant/6923/large/allen-frye-2025-12-09-08-26-23__xgfj__ID6923.jpg","Cam Rowston":"https://gidstats.com/img/fighters/0/0/1-2510.png","Jean-Paul Lebosnoyani":"https://gidstats.com/img/fighters/0/0/1-2715.png","Mason Jones":"https://gidstats.com/img/fighters/0/0/2-144.png","Melquizael Costa":"https://gidstats.com/img/fighters/0/0/2-1019.png","Yadier del Valle":"https://gidstats.com/img/fighters/460/700/1-2479.png","Dakota Hope":"https://gidstats.com/img/fighters/460/700/1-2871.png","Casey O'Neill":"https://gidstats.com/img/fighters/0/0/1-284.png","Shi Ming":"https://gidstats.com/img/fighters/0/0/1-2441.png","Josh Hokit":"https://gidstats.ru/img/fighters/0/0/1-2529.png","Navajo Stirling":"https://cdn.gidstats.com/img/fighters/0/0/2-1426.png","Kevin Vallejos":"https://gidstats.com/img/fighters/0/0/1-2151.png","David Martínez":"https://gidstats.com/img/fighters/460/700/1-2382.png","Manel Kape":"https://dmxg5wxfqgb4u.cloudfront.net/styles/athlete_bio_full_body/s3/2023-09/KAPE_MANEL_L_09-09.png?itok=aEvvQ_-y","Ailín Pérez":"https://tn.com.ar/resizer/v2/ailin-perez-regresa-al-octagono-de-la-ufc-para-pelear-con-la-brasilena-norma-dumont-ya-soy-historica-pero-quiero-mas-foto-ailinperezufcig-TRHFR7XAXBAKVMCVECLPCLLI4I.jpg?auth=99ec39ff115f742ed92d8c5307b738adbf1101cfaf84706f3523415ada6f11a6&width=1023","Joselyne Edwards":"https://gidstats.com/img/fighters/460/700/1-446.png","Alexa Grasso":"https://cdn.gidstats.com/img/fighters/0/0/1-632.png","Manon Fiorot":"https://www.mmafullcontact.com/wp-content/uploads/2022/06/1297434574-1024x1024.jpg","Denise Gomes":"https://dmxg5wxfqgb4u.cloudfront.net/styles/inline/s3/2024-06/GettyImages-1482486234.jpg?itok=lRteDrsF","Alexander Volkanovski":"https://a.espncdn.com/i/headshots/mma/players/full/3949584.png"}).map(([n,u])=>[normalizePortraitName(n),u]));
const portraitURL=name=>(window.BEFNLocalImages?window.BEFNLocalImages.url(name,'thumb'):'')||knownPortraits.get(normalizePortraitName(name))||'';
const personInitials=name=>String(name||'').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()||'').join('')||'•';
/* Shared, deliberately non-photographic fallback; still visible when no
   photograph is licensed, network-capable or image-host permitted. */
const fighterPortraitFallback=name=>`<div class="befn-portrait-fallback" role="img" aria-label="Photograph unavailable for ${esc(name)}"><strong aria-hidden="true">${esc(personInitials(name))}</strong><span aria-hidden="true">Photo unavailable</span></div>`;
const syncFighterPortraits=root=>{
 // Catch already-cached portraits whose load event fired before the
 // image event listener was registered. Never invent a photo for a name.
 root?.querySelectorAll?.('[data-fighter-portrait] img').forEach(img=>{
  const frame=img.closest('[data-fighter-portrait]');
  if(!frame||!img.complete)return;
  if(img.naturalWidth>0&&!img.classList.contains('is-error')){
   frame.classList.add('is-loaded');
   frame.dataset.portraitState='image';
  }else{
   frame.classList.remove('is-loaded');
   frame.dataset.portraitState='fallback';
   img.classList.add('is-error');
  }
 });
};


const portraitRequests=new Map();
async function findWikipediaPortrait(name){
 const key=normalizePortraitName(name);if(portraitRequests.has(key))return portraitRequests.get(key);
 const promise=(async()=>{
  try{
   const aliases={'jose salas reyes':'José Salas Reyes','jesse rodriguez':'Jesse Rodriguez (boxer)','natália silva':'Natalia Silva (fighter)','josh kelly':'Josh Kelly (boxer)'};
   const title=aliases[key]||name;
   const resp=await fetch('https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1&prop=pageimages&pithumbsize=320&titles='+encodeURIComponent(title),{mode:'cors'});
   if(!resp.ok)return '';
   const data=await resp.json();
   const page=Object.values(data.query?.pages||{})[0];
   if(!page||page.missing!==undefined||!page.thumbnail?.source)return '';
   const pageName=normalizePortraitName(page.title).replace(/ \([^)]*\)$/,'');
   if(pageName!==key && normalizePortraitName(title).replace(/ \([^)]*\)$/,'')!==pageName)return '';
   return /^https:\/\//.test(page.thumbnail.source)?page.thumbnail.source:'';
  }catch{return ''}
 })();
 portraitRequests.set(key,promise);return promise;
}
async function hydrateMissingPortraits(){
 const els=[...document.querySelectorAll('.champ-cell .thumb:not(:has(img)),.social-card .thumb:not(:has(img))')];
 const unique=[...new Set(els.map(el=>el.getAttribute('data-image-for')).filter(n=>n && !/^(vacant|r\/|fan)/i.test(n)))];
 for(let i=0;i<unique.length;i+=5){
  await Promise.all(unique.slice(i,i+5).map(async name=>{
   const url=await findWikipediaPortrait(name);if(!url)return;
   const probe=new Image();probe.referrerPolicy='no-referrer';
   probe.onload=()=>{
    if(probe.naturalWidth<35||probe.naturalHeight<35)return;
    document.querySelectorAll('.thumb[data-image-for]').forEach(el=>{
     if(el.getAttribute('data-image-for')!==name || el.querySelector('img'))return;
     const img=document.createElement('img');img.alt='';img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';img.src=url;
     img.onerror=()=>img.remove();el.appendChild(img);
    });
   };probe.src=url;
  }));
 }
}
const champThumb=(name,photo)=>{const u=photo||portraitURL(name);return `<button type="button" class="thumb champ-preview-trigger" data-image-for="${esc(name)}" data-initials="${esc(personInitials(name))}" data-hover-fighter="${esc(name)}" data-hover-photo="${u?safeURL(u):''}" aria-label="Preview photograph of ${esc(name)}" aria-describedby="fighter-photo-preview" title="Hover, focus or tap for full photograph">${u?`<img loading="lazy" referrerpolicy="no-referrer" decoding="async" src="${safeURL(u)}" alt="">`:''}</button>`};
const thumb=(url,alt,cls='thumb')=>`<span class="${cls}" data-image-for="${esc(alt)}" data-initials="${esc(personInitials(alt))}">${(url||portraitURL(alt))?`<img loading="lazy" referrerpolicy="no-referrer" decoding="async" src="${safeURL(url||portraitURL(alt))}" alt="">`:''}</span>`;
const champPeek=(name,photo)=>`<button type="button" class="fighter-hover-name" data-hover-fighter="${esc(name)}" data-hover-photo="${photo||portraitURL(name)?safeURL(photo||portraitURL(name)):''}" aria-label="Preview photograph of ${esc(name)}" aria-describedby="fighter-photo-preview" title="Hover, focus or tap to see a large photograph">${esc(name)}</button>`;
const viewTitle=(label,title)=>`<header class="section-heading"><div><h1>${esc(title)}</h1></div></header>`;
const calendarSportIcons=Object.freeze({
 boxing:`<svg class="sport-toggle-icon" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" fill="none" aria-hidden="true" focusable="false"><path d="M14.3 29.1c-6.1-.8-9.4-4.9-9.4-10.7v-6.3c0-3.8 2.5-6.4 5.8-6.4 1.2-3 5.5-3.7 7.9-1.2 3.8-2.7 8.2-.6 9.2 3.3 4.2.4 6.8 4.1 6.8 9.2 0 6.5-4.5 11.3-10 12.1" stroke="currentColor" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.7 7.2v7.5a4.3 4.3 0 0 0 4.3 4.3h2.2M17.8 5.8v7.5a4 4 0 0 0 4 4h1.8" stroke="currentColor" stroke-width="2.7" stroke-linecap="round"/><path d="M13 28h14v8H13z" stroke="currentColor" stroke-width="2.7" stroke-linejoin="round"/><path d="M13 32h14" stroke="currentColor" stroke-width="2.7"/></svg>`,
 mma:`<svg class="sport-toggle-icon" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" fill="none" aria-hidden="true" focusable="false"><path d="M6.1 16V9.8a3.2 3.2 0 0 1 6.4 0V14m0-4.4V7.4a3.2 3.2 0 0 1 6.4 0v6.7m0-5.5a3.2 3.2 0 0 1 6.4 0v6.1m0-4a3.1 3.1 0 0 1 6.2 0v8.4" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.1 15.3c-3.4-1.1-5 1.8-3.1 5.6l4.1 8.3c1.2 2.5 3.6 3.9 6.7 3.9h13.3c3.2-2.4 5.1-5.5 5.1-9.8v-4.4c-3.5-1.8-6.8-1.1-9 3.1l-4.8-3.2" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 32.9v4h15v-4M12 35h15" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/></svg>`,
 grappling:`<svg class="sport-toggle-icon" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" fill="none" aria-hidden="true" focusable="false"><circle cx="11" cy="7.3" r="4" stroke="currentColor" stroke-width="2.6"/><circle cx="29" cy="7.3" r="4" stroke="currentColor" stroke-width="2.6"/><path d="m9 13-5 8 7 5 8-8m12-5 5 8-7 5-8-8M13 14l7 5 7-5M9 19l6 5-4 12m20-17-6 5 4 12M15 24l6 12m10-12-6 12" stroke="currentColor" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"/><path d="m16 15 4 4 4-4" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`
});
const calendarSportLabels=Object.freeze({boxing:'Boxing',mma:'Mixed martial arts',grappling:'Wrestling and grappling'});
const calendarHeading=`<header class="section-heading calendar-photo-heading"><h1>Fights</h1></header>`;
const segments=(name,opts,selected)=>`<div class="segment${name==='calendar'?' sport-photo-segment':''}" role="group" aria-label="${name==='calendar'?'Fight discipline':esc(name)}">${opts.map(x=>`<button type="button" data-segment="${esc(name)}" data-value="${esc(x)}"${name==='calendar'?` aria-label="${calendarSportLabels[x]||esc(x)}" title="${calendarSportLabels[x]||esc(x)}"`:''} aria-pressed="${String(x===selected)}">${name==='calendar'?`<span class="sport-photo-visual" aria-hidden="true"></span>`:esc(x)}</button>`).join('')}</div>`;
const badge=`<details class="archive-caution"><summary>Archive verification note</summary><p>Some historical fighter records and photographs need reconfirmation. Check the linked sources.</p></details>`;
const renderFrame=(inner)=>`${(['champions','fighters'].includes(location.hash.slice(1)))?badge:''}<div class="shell page">${inner}</div>`;
const picture=(src,alt)=>`<div class="card-photo">${src?`<img loading="lazy" src="${safeURL(src)}" alt="${esc(alt)}" referrerpolicy="no-referrer">`:''}<div class="photo-fail">PHOTOGRAPH UNAVAILABLE</div></div>`;
const newsCard=x=>headlineCard({title:x.title,summary:x.summary,sport:x.eyebrow||'Archive feature',source:domain(x.source),url:x.source,image:x.image?{url:x.image,alt:x.imageAlt||x.title,credit:x.imageCredit||'',kind:'archive'}:null});
/* The live public fight desk runs independently. */
state.news='all';state.newsPage=1;state.newsMode='latest';state.newsSort='latest';state.talkRole='all';state.talkSort='balanced';state.talkPromotion='all';state.talkFighter='';state.social='all';state.matDiscipline='all';
const activeSport=()=>window.BEFNSport?.get()||'all';
const articleMatchesSport=a=>activeSport()==='all'||a.sport===activeSport()||(Array.isArray(a.sports)&&a.sports.includes(activeSport()));
function syncGlobalSport(){
 const sport=activeSport();state.news=sport;state.calendar=sport;state.social=sport;state.champions=sport;
 state.fightersSport=sport==='all'?'All':sport==='boxing'?'Boxing':sport==='mma'?'MMA':'Grappling';
 state.fightersDivision='All';state.newsPage=1;state.socialPage=1;
}
syncGlobalSport();
const desk={language:null,articles:[],sources:[],lastSuccessfulAt:null,events:[],reviewedAt:null,error:'',pending:null};
const displayDate=v=>window.FightTime.localDateTime(v);
const dayLabel=v=>new Date(v+'T12:00:00Z').toLocaleDateString('en-AU',{dateStyle:'medium',timeZone:'UTC'});
async function deskJSON(path){
 const base='https://raw.githubusercontent.com/lukejelkins-beep/Black-Eye-Fight-News/main/';
 const results=await Promise.all([base+path,path].map(async url=>{
  try{
   const r=await fetch(url+'?t='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(15000)});
   if(!r.ok)return null;
   const data=await r.json();
   if(path.endsWith('news-live.json')&&!Array.isArray(data.articles))return null;
   if(path.endsWith('grappling-events.json')&&!Array.isArray(data.events))return null;
   return data;
  }catch{return null;}
 }));
 const valid=results.filter(Boolean);
 valid.sort((a,b)=>(Date.parse(b.lastSuccessfulAt||b.reviewedAt)||0)-(Date.parse(a.lastSuccessfulAt||a.reviewedAt)||0));
 if(valid.length)return valid[0];
 throw Error('Feed unavailable');
}
async function loadDesk(background=false){
 try{
  const [n,e]=await Promise.all([deskJSON('data/news-live.json'),deskJSON('data/grappling-events.json')]);
  if(!Array.isArray(n.articles)||!Array.isArray(e.events))throw Error('Invalid feed');
  const lang=await deskJSON('data/news-language-live.json').catch(()=>null);if(lang&&Array.isArray(lang.stories))desk.language=lang;
  if(background){if(JSON.stringify(n.articles)===JSON.stringify(desk.articles)&&JSON.stringify(e.events)===JSON.stringify(desk.events)){Object.assign(desk,n,{error:''});return;}if(!location.hash||location.hash==='#home'){Object.assign(desk,n,{events:e.events,reviewedAt:e.reviewedAt,error:'',pending:null});const target=document.getElementById('main');if(target)target.innerHTML=renderHome();return;}desk.pending={n,e};const button=document.getElementById('desk-updates');if(button){button.hidden=false;button.textContent='New headlines available — show updates';}return;}
  Object.assign(desk,n,{events:e.events,reviewedAt:e.reviewedAt,error:'',pending:null});
 }catch{desk.error='Current feed unavailable. Previously loaded items remain visible.';}
 if(['','#home','#news','#calendar','#results'].includes(location.hash))navigate();
}
const sourceHealth=()=>'<details class="source-health"><summary>News updated '+(desk.lastSuccessfulAt?esc(displayDate(desk.lastSuccessfulAt)):'pending')+'</summary><p>'+(desk.sources.some(s=>!s.ok)?'Some sources are delayed. ':'')+'Checks run every 15 minutes; publication and indexing can be delayed. '+esc(desk.error)+'</p></details><button class="btn" id="desk-updates" hidden>Show fresh updates</button>';
function newsFighterImage(a){
 if(a.fighterImage&&/^assets\/img\/[a-z0-9-]+\/[a-z0-9-]+\.webp$/.test(a.fighterImage.url||''))return {url:a.fighterImage.url,name:a.fighterImage.name};
 const title=a.title.toLowerCase();
 const fighter=(D.fighters||[]).filter(f=>f.name&&f.photo&&title.includes(f.name.toLowerCase())).sort((a,b)=>b.name.length-a.name.length)[0];
 return fighter&&/^https:\/\//.test(fighter.photo)?{url:fighter.photo,name:fighter.name}:null;
}
// Reject cached repetition while the source-summary collector refreshes old stories.
function distinctNewsPoints(a){
 const raw=Array.isArray(a.summaryPoints)?a.summaryPoints.filter(p=>typeof p==='string'&&p.trim()):[];
 const stop=new Set('the a an and or but that this these those there their them they he she his her who it its is are was were be been being to for from in on at by of with as into about after before while also than then through over under more most very has have had says said saying according today year years two three one all not just do did does will would could should which what when where how up out off best big great new latest'.split(' '));
 const alias={bouts:'fight',bout:'fight',fights:'fight',matchup:'fight',matchups:'fight',matches:'fight',clash:'fight',clashes:'fight',battle:'fight',prospects:'prospect',comers:'prospect',upcomers:'prospect',rising:'prospect',booked:'scheduled',booking:'scheduled',announced:'scheduled',announcement:'scheduled',added:'scheduled',confirmed:'scheduled',criticized:'criticism',criticised:'criticism',backlash:'criticism'};
 const words=point=>new Set((point.toLowerCase().match(/[a-z0-9]+/g)||[]).filter(w=>w.length>2&&!stop.has(w)).map(w=>alias[w]||w));
 const theme=point=>{
  const p=point.toLowerCase();
  if(/\b(?:penalt(?:y|ies)|fine|demand(?:ed|ing)?)\b/.test(p)&&/(?:\$\s*\d|\b(?:payment|dollars|fine|negotiations|talks)\b)/.test(p))return 'financial-demand';
  if(/\b(?:apolog(?:y|ize|ise|ized|ised)|regrets?|sorry)\b/.test(p))return 'apology';
  if(/\b(?:criticism|criticis|criticiz|backlash|upset fans|off.color joke|controvers(?:y|ial))/.test(p))return 'backlash';
  if(/\b(?:added|booked|announced|confirmed|scheduled|matching up|set to face|collide|agree(?:d)? to fight)\b/.test(p)&&/\b(?:fight|bout|match|prospect|clash|battle|pairing)\b/.test(p))return 'fight-booking';
  if(/\b(?:heavyweights?|division)\b/.test(p)&&/\b(?:best|better|greatest|never been|demise|strongest)\b/.test(p))return 'division-assessment';
  return '';
 };
 const selected=[];
 for(const point of raw){
  if(/\b(?:first to report|addressed the chaos|met the media)\b/i.test(point)||/\b(?:vs|versus|against)\.?$/i.test(point))continue;
  const current=words(point),kind=theme(point);
  if(!current.size)continue;
  if(selected.some(other=>{
   const shared=[...current].filter(word=>other.tokens.has(word)).length;
   return (shared>=3&&(shared/Math.min(current.size,other.tokens.size)>=.57||shared/new Set([...current,...other.tokens]).size>=.45))
    ||(kind&&kind===other.kind&&shared>=2);
  }))continue;
  selected.push({text:point,tokens:current,kind});
  if(selected.length===3)break;
 }
 return selected.map(p=>p.text);
}
function newsPointsHTML(a,kind='standard'){
 const limit=kind==='feature'?2:1;
 const points=editorialSummaryPoints(a,limit,kind==='feature'?145:115);
 return points.length?'<ul class="news-strip-points" aria-label="Key facts from original reporting">'+points.map(point=>'<li>'+esc(point)+'</li>').join('')+'</ul>':'';
}
/* News metadata stays source-led: indexed dates are never presented as publisher publication times. */
function newsDisplayMeta(a){
 const raw=Date.parse(a.publishedAt||'');
 const valid=Number.isFinite(raw);
 const age=valid?Date.now()-raw:Infinity;
 const published=valid&&age>=0&&age<=60*60*1000*24*365;
 const indexed=Boolean(a.timeBasis);
 const emphasis=published&&!indexed&&age<=2*60*60*1000
   &&/\b(?:confirmed|announced|withdraws?|cancelled|postponed|injured|suspended|signs|signed|retires?|died|dies|breaking)\b/i.test(a.title||'');
 const time=published?'<time class="befn-news-time" datetime="'+new Date(raw).toISOString()+'" title="'+esc(indexed?(a.timeBasis||'Indexed timestamp'):('Published '+displayDate(a.publishedAt)))+'">'+(indexed?'Indexed ':'')+esc(displayDate(a.publishedAt))+'</time>':'';
 return '<span class="befn-news-meta">'
   +(emphasis?'<span class="befn-news-breaking" aria-label="Breaking development">BREAKING</span>':'')
   +'<span class="befn-news-publisher">'+esc(a.source||'Publisher')+'</span>'
   +(time?'<span class="befn-news-meta-dot" aria-hidden="true">·</span>'+time:'')
   +'</span>';
}
function headlineCard(a){
 const fighter=newsFighterImage(a),publisher=a.image&&/^https:\/\//.test(a.image.url||'')?a.image:null;
 const src=publisher?publisher.url:fighter?fighter.url:'';
 const alt=publisher?(publisher.alt||a.title):fighter?'File photo of '+fighter.name:a.sport+' news';
 const href=safeURL(a.url);
 const summary=newsPointsHTML(a);
 return '<article class="news-card live-news-card news-strip">'
  +'<div class="news-strip-top"><div class="news-strip-story"><p class="news-strip-source">'+newsDisplayMeta(a)+(activeSport()==='all'?'<span class="befn-news-sport">'+esc(a.sport.toUpperCase())+'</span>':'')+'</p>'
  +'<h3 class="news-strip-headline"><a href="'+href+'" target="_blank" rel="noopener noreferrer">'+esc(a.title)+'</a></h3></div>'
  +(src?'<a class="news-strip-thumbnail" href="'+href+'" target="_blank" rel="noopener noreferrer" aria-label="Read '+esc(a.title)+'"><img class="live-news-image" src="'+safeURL(src)+'" alt="'+esc(alt)+'" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-news-fallback="'+(fighter?safeURL(fighter.url):'')+'" data-news-fallback-name="'+(fighter?esc(fighter.name):'')+'"></a>':'')+'</div>'
  +summary+'<a class="news-strip-original" href="'+href+'" target="_blank" rel="noopener noreferrer">Read original ↗</a></article>';
}

function newsFeatureCard(a){
 const fighter=newsFighterImage(a),publisher=a.image&&/^https:\/\//.test(a.image.url||'')?a.image:null;
 const src=publisher?publisher.url:fighter?fighter.url:'';
 const alt=publisher?(publisher.alt||a.title):fighter?'File photo of '+fighter.name:a.sport+' news';
 const href=safeURL(a.url);
 const summary=newsPointsHTML(a,'feature');
 return '<article class="live-news-card news-feature-card">'
  +(src?'<a href="'+href+'" class="news-feature-photo" target="_blank" rel="noopener noreferrer" aria-label="Read '+esc(a.title)+'"><img class="live-news-image" src="'+safeURL(src)+'" alt="'+esc(alt)+'" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-news-fallback="'+(fighter?safeURL(fighter.url):'')+'" data-news-fallback-name="'+(fighter?esc(fighter.name):'')+'"></a>':'')
  +'<div class="news-feature-copy"><div class="news-feature-kicker">'+newsDisplayMeta(a)+(activeSport()==='all'?'<span class="befn-news-sport">'+esc(a.sport.toUpperCase())+'</span>':'')+'</div>'
  +'<h3><a href="'+href+'" target="_blank" rel="noopener noreferrer">'+esc(a.title)+'</a></h3>'
  +summary+'<a class="news-strip-original" href="'+href+'" target="_blank" rel="noopener noreferrer">Read original ↗</a></div></article>';
}
document.addEventListener('error',event=>{
 const img=event.target;if(!img.classList?.contains('live-news-image'))return;
 // Top Stories use their own portrait fallback; do not remove their images here.
 if(img.closest('.top-story-full'))return;
 queueMicrotask(()=>{
  const card=img.closest('.live-news-card'),credit=card?.querySelector('.live-news-credit');
  img.classList.remove('is-error');
  if(!img.dataset.newsAttempt&&img.dataset.newsFallback&&img.src!==img.dataset.newsFallback){
   img.dataset.newsAttempt='fighter';img.src=img.dataset.newsFallback;img.alt='File photo of '+img.dataset.newsFallbackName;
   if(credit)credit.textContent='File photo · '+img.dataset.newsFallbackName;
  }else{img.closest('.news-strip-thumbnail,.news-feature-photo,.front-lead-image')?.classList.add('news-image-unavailable');img.remove();}
 });
},true);
function renderNews(){return renderHome();} // Legacy News link compatibility.
function eventCard(e){return `<article class="news-card" style="padding:24px"><div class="card-kicker">${esc(e.discipline)} · ${esc(e.status)}</div><span data-mat-status="${esc(e.id)}">${window.EventStatus?.badge(e)||''}</span><h3>${esc(e.name)}</h3><p><strong>${esc(dayLabel(e.date))}${e.endDate?' – '+esc(dayLabel(e.endDate)):''}</strong> · venue-local date</p><p>${esc(e.location)}</p><p>${esc(e.competitors)}</p><p>${esc(e.why)}</p>${window.FightTime.instant(e.startAt)?'<p>Local start: '+esc(displayDate(e.startAt))+' · <span class="mat-countdown" data-mat-start="'+esc(e.startAt)+'">'+esc(window.FightTime.relative(e.startAt))+'</span></p>':'<p>Start time TBC · date remains venue-local</p>'}<p>${esc(e.watch)}</p><a href="${safeURL(e.source)}" target="_blank" rel="noopener noreferrer">Official event details ↗</a><p class="panel-note">Checked ${esc(e.verifiedAt)}</p></article>`;}

function renderFightsContent(){
 const sport=activeSport();
 if(fightDesk.view==='results')return window.ResultsDesk.render({embedded:true});
 return sport==='grappling'?renderGrapplingEvents(false):window.UpcomingCards.render(sport)+(sport==='all'?renderGrapplingEvents(true):'');
}
function renderFightsControls(){
 const views=[['upcoming','Upcoming'],['results','Results']].map(([id,label])=>'<button type="button" role="tab" data-fights-view="'+id+'" class="fights-view-tab'+(fightDesk.view===id?' is-active':'')+'" aria-selected="'+String(fightDesk.view===id)+'" aria-controls="fights-active-content">'+label+'</button>').join('');
 const logos=[['ufc','UFC','UFC Logo.svg'],['one','ONE','ONE Championship.png'],['pfl','PFL','Professional Fighters League Primary Logo.jpg']];
 const promotions=activeSport()==='mma'?'<div class="fights-promotion-tabs" role="group" aria-label="MMA organisation">'+logos.map(([id,label,file])=>'<button type="button" data-fights-promotion="'+id+'" class="fights-promotion-tab'+(fightDesk.promotion===id?' is-active':'')+'" aria-label="'+label+'" aria-pressed="'+String(fightDesk.promotion===id)+'"><img src="https://commons.wikimedia.org/wiki/Special:FilePath/'+encodeURIComponent(file)+'" alt="" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span hidden>'+label+'</span></button>').join('')+'</div>':'';
 return '<div class="fights-controls"><label class="fights-search"><span class="fights-search-icon" aria-hidden="true">⌕</span><input type="search" id="fights-event-search" placeholder="Search by events or fighters" aria-label="Search by events or fighters" value="'+esc(fightDesk.query)+'"></label><div class="fights-view-tabs" role="tablist" aria-label="Fight schedule or completed results">'+views+'</div>'+promotions+'</div>';
}
function renderFights(){return renderFrame('<section class="fights-unified">'+calendarHeading+renderFightsControls()+'<div id="fights-active-content" role="tabpanel">'+renderFightsContent()+'</div></section>');}
function renderCalendar(){return renderFights();}
function renderGrapplingEvents(underOtherSports){
 const horizon=window.FightTime.dayKey(new Date(Date.now()+42*86400000));
 const day=e=>window.FightTime.instant(e.startAt)?window.FightTime.dayKey(new Date(e.startAt)):e.date;
 const recent=window.FightTime.dayKey(new Date(Date.now()-2*86400000));
 const all=desk.events.filter(e=>{
  if(state.matDiscipline!=='all'&&(state.matDiscipline==='BJJ / submission'? !['BJJ / submission','UFC BJJ','ONE Grappling','ADCC','FloGrappling'].includes(e.discipline):e.discipline!==state.matDiscipline))return false;
  const start=window.FightTime.instant(e.startAt);
  return start?start.getTime()>Date.now()-36*3600000:(e.endDate||e.date)>=recent;
 }).sort((a,b)=>day(a).localeCompare(day(b)));
 const near=all.filter(e=>day(e)<=horizon),later=all.filter(e=>day(e)>horizon);
 return '<section class="befn-grappling-schedule">'
 +(underOtherSports?'<h2>Grappling & wrestling</h2>':'')
 +'<div class="filter-row">'+segments('matDiscipline',['all','RAF','BJJ / submission','NCAA','Freestyle','Greco-Roman'],state.matDiscipline)+'</div>'
 +'<p class="panel-note">Official listings last reviewed '+esc(desk.reviewedAt||'not yet loaded')+'. Local starts and countdowns adjust automatically. Date-only listings remain venue dates. Dates may change. Unverified matchups and viewing details are explicitly marked.</p>'
 +'<h2>Next six weeks</h2><div class="grid news-grid">'+(near.length?near.map(eventCard).join(''):'<p>No confirmed upcoming events loaded for this selection.</p>')+'</div>'
 +(later.length?'<h2>Looking further ahead</h2><div class="grid news-grid">'+later.map(eventCard).join('')+'</div>':'')+'</section>';
}

function headlineEligible(a){
 if(!a||typeof a.title!=='string'||!/^https:\/\//.test(a.url||'')||!Number.isFinite(Date.parse(a.publishedAt)))return false;
 if(/\/story\/sports\/(?:nfl|nba|nhl|mlb|football|basketball|baseball|hockey|soccer|golf|college)(?:\/|$)/i.test(a.url))return false;
 // Results, replays and viewing guides belong in their own sections.
 return !/\b(?:main card results|prelim(?:inary)? results|official weigh-in results|post-fight show|post-event facts|bonus coverage|scorecards?|round-by-round|fight by fight preview|how to watch|stream|betting odds|predictions?|live blog|promotional guidelines|video: every|monthly report)\b/i.test(a.title)
  && !/^(?:video:|ufc .{0,35} video:)/i.test(a.title)
  && !/\bresults?\b\s*(?:\||:|[-–—]|\b(?:from|for|of)\b)/i.test(a.title);
}
function headlineImportance(a,now){
 const title=a.title;
 const age=(now-Date.parse(a.publishedAt))/3600000;
 const fresh=Math.max(0,1-Math.max(0,age)/48)*12;
 const confirmed=/\b(?:announc\w*|confirm\w*|scheduled|booked|sign(?:s|ed|ing)?|scratched|withdraw\w*|cancell?ed|postpon\w*|set for|to face|to fight|unification|suspend\w*|replacement|added to)\b/i.test(title);
 const cardUpdate=/\b(?:fight card|title shot|title fight|championship)\b/i.test(title);
 const important=/\b(?:attacked|hospitali[sz]ed|doctor stops|injur\w*|fine|investigation|controversy|brawl|deal|dispute|retir\w*|return\w*)\b/i.test(title);
 const commentary=/\b(?:calls? out|wants|believes|reaction|react|post-fight|highlights|finish|knockout win|knockout in|knockout at|what's next|predictions?|recap|ahead of)\b/i.test(title);
 return fresh+(confirmed?18:0)+(cardUpdate?5:0)+(important?8:0)+(commentary?-7:0)+Math.min(3,Math.max(0,Number(a.score)||0));
}
function topStories(){
 const now=Date.now();
 const verified=window.BEFNNewsUnique(desk.articles).filter(headlineEligible).filter(articleMatchesSport);
 const recent=verified.filter(a=>Date.parse(a.publishedAt)<=now+30*60*1000&&Date.parse(a.publishedAt)>=now-48*3600*1000);
 const candidates=recent.length?recent:verified;
 const unique=new Map();
 for(const a of candidates){
  const key=a.title.toLowerCase().replace(/[^a-z0-9]+/g,'');
  if(!unique.has(key))unique.set(key,a);
 }
 const ranked=[...unique.values()].sort((a,b)=>headlineImportance(b,now)-headlineImportance(a,now)||Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
 // Prevent a single publisher or sport from occupying every lead slot.
 const lead=[];
 for(const a of ranked){
  if(lead.length===4)break;
  if(lead.filter(x=>x.source===a.source).length>=2)continue;
  lead.push(a);
 }
 for(const sport of ['boxing','mma']){
  if(activeSport()!=='all')break;
  if(lead.length===4&&!lead.some(x=>x.sport===sport)){
   const alt=ranked.find(a=>a.sport===sport&&!lead.some(x=>x.url===a.url));
   if(alt)lead[3]=alt;
  }
 }
 const seen=new Set(lead.map(x=>x.url));
 return [...lead,...ranked.filter(a=>!seen.has(a.url))].slice(0,10);
}
function topStoryPhoto(a){
 const original=a.image?.url&&/^https:\/\//i.test(a.image.url)?a.image.url:'';
 const fighter=newsFighterImage(a);
 return original?{url:original,alt:a.image?.alt||a.title}:fighter?{url:fighter.url,alt:fighter.name}:{url:'',alt:''};
}
function topStoryPhotoSubject(a){
 const known=newsFighterImage(a);
 if(known)return known.name;
 const names=(a.title.match(/\b[A-Z][a-zÀ-ÿ'’-]+\s+[A-Z][a-zÀ-ÿ'’-]+/g)||[]);
 const ignored=/^(?:Breaking News|Fight Night|New York|Las Vegas|World Boxing|The Ultimate)$/i;
 return names.map(n=>n.trim()).find(n=>n.split(' ').length>=2&&!ignored.test(n))||'';
}
const topStoryPhotoCache=new Map();
async function findTopStoryAlternative(a){
 const subject=topStoryPhotoSubject(a);
 if(!subject)return '';
 if(topStoryPhotoCache.has(subject))return topStoryPhotoCache.get(subject);
 const request=findWikipediaPortrait(subject).catch(()=>'');
 topStoryPhotoCache.set(subject,request);
 return request;
}
async function findCommonsTopStoryPhoto(subject){
 try{
  const api='https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=12&gsrsearch='+encodeURIComponent('intitle:'+subject)+'&prop=imageinfo&iiprop=url|size&iiurlwidth=1100&format=json&origin=*';
  const res=await fetch(api,{mode:'cors'});
  if(!res.ok)return '';
  const data=await res.json();
  const pages=Object.values(data.query?.pages||{});
  const tokens=subject.toLowerCase().split(/\s+/).filter(Boolean);
  const match=pages.find(p=>{
   const title=(p.title||'').toLowerCase();
   const info=p.imageinfo?.[0];
   return tokens.every(t=>title.includes(t))&&info?.thumburl&&info.width>=400&&info.height>=250&&/\.(?:jpg|jpeg|png|webp)(?:$|\?)/i.test(info.url||'');
  });
  return match?.imageinfo?.[0]?.thumburl||'';
 }catch{return ''}
}
function hydrateTopStoryPhotos(){
 document.querySelectorAll('.top-story-full img[data-photo-subject]').forEach(img=>{
  if(img.dataset.photoAttempted==='yes')return;
  img.dataset.photoAttempted='yes';
  const subject=img.dataset.photoSubject;
  const fallback=async()=>{
   if(img.dataset.photoFallback==='yes')return;
   img.dataset.photoFallback='yes';
   let url=await findWikipediaPortrait(subject).catch(()=>'');
   if(!url)url=await findCommonsTopStoryPhoto(subject);
   if(!url){img.closest('.front-lead-image')?.classList.add('top-story-photo-unavailable');return;}
   img.alt='Photograph of '+subject;
   img.closest('.front-lead-image')?.classList.remove('top-story-photo-unavailable');
   img.src=url;
  };
  img.addEventListener('error',fallback,{once:true});
  if(!img.getAttribute('src')||img.complete&&!img.naturalWidth)fallback();
 });
}
/* Editorial summary policy (see docs/news-summary-standard.md):
   Never invent facts. Pick independent, complete, concise source sentences.
   The card decides the bullet count; snippets never end in manufactured ellipses. */
function editorialSummaryPoints(article,limit=2,maxChars=145){
 const raw=distinctNewsPoints(article);
 const titleTokens=new Set(((article.title||'').toLowerCase().match(/[a-z0-9]+/g)||[]).filter(w=>w.length>3));
 const stop=/\b(?:read the full article|click here|read more|follow us|subscribe|advertisement|the post|in the video|as you can see|met the media)\b/i;
 const nonEnglish=/[^\x00-\x7F]/g;
 const termSet=text=>new Set((text.toLowerCase().match(/[a-z0-9]+/g)||[]).filter(w=>w.length>3));
 function tidy(original){
  let p=String(original||'').replace(/https?:\/\/\S+|(?:t\.co|pic\.twitter\.com)\/\S+/gi,'')
   .replace(/\s+/g,' ').trim().replace(/^[-•\s]+/,'');
  p=p.replace(/^(?:As noted in (?:the|its) release|According to (?:the|a) (?:report|release)|In (?:a|the) press release),\s*/i,'');
  // Publisher introductions can be removed when a complete 'that' clause follows.
  p=p.replace(/^(?:The UFC|The promotion|The organization|The organisation)\s+(?:announced|confirmed|said)\b.{0,76}?\bthat\s+(?=[A-Z])/i,'');
  p=p.replace(/^([a-z])/,(_,c)=>c.toUpperCase());
  if(p.length>110&&/,\s+and\s+/i.test(p)){
   const first=p.split(/,\s+and\s+/i)[0];
   if(first.length>=40&&first.length<=maxChars)p=first;
  }
  if(p.length>maxChars&&/;\s+/.test(p)){
   const first=p.split(/;\s+/)[0];
   if(first.length>=40&&first.length<=maxChars)p=first;
  }
  p=p.replace(/\s*[\u2026.]{3,}\s*$/,'').replace(/[,;:\-–—\s]+$/,'').trim();
  if(!p||p.length<32||p.length>maxChars||stop.test(p)||/\u2026/.test(p))return '';
  if((p.match(nonEnglish)||[]).length>4)return '';
  if(/^(?:it|he|she|they|this|that|these|those|here)\s/i.test(p))return '';
  if(!/[a-z][a-z]/i.test(p)||/\b(?:and|or|but|because|with|against|at|on|in|from|to|for)$/i.test(p))return '';
  return p.replace(/[.!?]?$/,'.');
 }
 const candidates=[];
 for(const point of raw){
  const clean=tidy(point);
  if(!clean)continue;
  const tokens=termSet(clean);
  const fresh=[...tokens].filter(w=>!titleTokens.has(w)).length;
  const overlap=[...tokens].filter(w=>titleTokens.has(w)).length;
  const vague=/\b(?:foreseeable future|sticking around|making headlines|fans are excited|a big deal|great opportunity)\b/i.test(clean);
  const specificity=/\b(?:\d{1,4}|since|until|through|against|defeated|signed|extension|withdrew|injured|confirmed|announced|will face|will fight)\b/i.test(clean);
  const score=(specificity?5:0)+Math.min(5,fresh)+(overlap>0?1:0)
     -(vague?8:0)-(fresh<2?5:0)-(clean.length>120?2:0);
  candidates.push({text:clean,tokens,score});
 }
 candidates.sort((a,b)=>b.score-a.score);
 const chosen=[];
 for(const item of candidates){
  if(item.score<0)continue;
  if(chosen.some(previous=>{
   const common=[...item.tokens].filter(t=>previous.tokens.has(t)).length;
   return common>=3&&common/Math.min(item.tokens.size,previous.tokens.size)>=.65;
  }))continue;
  chosen.push(item);
  if(chosen.length>=limit)break;
 }
 return chosen.map(item=>item.text);
}
function topStoryShortPoints(a){
 return editorialSummaryPoints(a,2,155);
}
function topStoryCard(a){
 const photo=topStoryPhoto(a),points=topStoryShortPoints(a),subject=topStoryPhotoSubject(a);
 const href=safeURL(a.url);
 return '<article class="front-lead-card top-story-full">'
  +'<a class="front-lead-image'+(!photo.url?' top-story-photo-unavailable':'')+'" href="'+href+'" target="_blank" rel="noopener noreferrer" aria-label="Read '+esc(a.title)+'"><img class="live-news-image front-lead-photo" data-photo-subject="'+esc(subject)+'" loading="lazy" referrerpolicy="no-referrer" decoding="async" src="'+safeURL(photo.url)+'" alt="'+esc(photo.alt)+'"></a>'
  +'<div class="front-lead-copy"><span class="front-story-meta">'+newsDisplayMeta(a)+'<span class="befn-news-sport">'+esc(a.sport.toUpperCase())+'</span></span>'
  +'<h2><a href="'+href+'" target="_blank" rel="noopener noreferrer">'+esc(a.title)+'</a></h2>'
  +(points.length?'<ul class="top-story-points" aria-label="Key verified facts">'+points.slice(0,3).map(p=>'<li>'+esc(p)+'</li>').join('')+'</ul>':'')
  +'<a class="top-story-read" href="'+href+'" target="_blank" rel="noopener noreferrer">Read original ↗</a>'
  +'</div></article>';
}

function newsPool(){return window.BEFNNewsUnique(desk.articles).filter(headlineEligible).filter(articleMatchesSport);}
function newsLeads(){return window.BEFNNewsPage.pickLeads(newsPool().filter(a=>Date.parse(a.publishedAt)<=Date.now()+30*60*1000),desk.leads);}
const newsPageHelpers=()=>({esc,safeURL,meta:newsDisplayMeta,photo:topStoryPhoto});
function newsFeedItems(){
 const promoted=new Set(newsLeads().map(l=>l.story.url));
 const seen=new Set(),now=Date.now();
 return window.BEFNNewsUnique(desk.articles).filter(headlineEligible).filter(a=>{
  if(promoted.has(a.url)||!articleMatchesSport(a))return false;
  const key=a.title.toLowerCase().replace(/[^a-z0-9]+/g,'');
  if(seen.has(key))return false;
  seen.add(key);return true;
 }).sort((a,b)=>state.newsSort==='significant'
  ?headlineImportance(b,now)-headlineImportance(a,now)||Date.parse(b.publishedAt)-Date.parse(a.publishedAt)
  :Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
}
function renderNewsFeed(){
 const all=newsFeedItems(),shown=all.slice(0,Math.max(1,state.newsPage||1)*14);
 const controls='<div class="unified-news-filters">'+segments('newsSort',['latest','significant'],state.newsSort)+'</div>';
 const more=shown.length<all.length?'<button class="news-load-more" type="button" data-news-more>Show more stories ('+(all.length-shown.length)+' remaining)</button>':'';
 const junkie=state.news==='mma'?'<a class="news-publisher-link" href="https://mmajunkie.usatoday.com/" target="_blank" rel="noopener noreferrer">MMA Junkie ↗</a>':'';
 const h=newsPageHelpers();
 return '<div class="np-list"><div class="np-list-head"><h2>Latest news</h2><span class="np-note unified-news-count">'+all.length+' stories</span></div>'
  +controls+junkie+'<div class="np-rows">'+(shown.length?shown.map(a=>window.BEFNNewsPage.rowHTML(a,h)).join(''):'<p class="front-loading">No other articles match these filters.</p>')+'</div>'
  +more+sourceHealth()+'</div>';
}
const agoText=iso=>{const t=Date.parse(iso);if(!Number.isFinite(t))return '';const m=Math.max(0,Math.floor((Date.now()-t)/60000));return m<1?'just now':m<60?m+' min ago':m<48*60?Math.floor(m/60)+' h ago':Math.floor(m/1440)+' days ago'};
const updatedLine=()=>desk.lastSuccessfulAt&&agoText(desk.lastSuccessfulAt)?'<p class="np-updated" data-updated-at="'+esc(desk.lastSuccessfulAt)+'">Updated <span>'+esc(agoText(desk.lastSuccessfulAt))+'</span></p>':'';
function renderHome(){
 const leads=newsLeads();
 const head='<header class="np-head"><h1>News</h1><p>'+(activeSport()==='all'?'Boxing, MMA, grappling and sumo, from the publishers that cover them.':'Latest '+esc(activeSport())+' news from the publishers that cover it.')+'</p>'+updatedLine()+'</header>';
 if(!leads.length)return renderFrame('<div class="np">'+head+'<p role="status" class="front-loading">'+(desk.articles.length?'No verified stories available for this sport yet.':'Checking the latest fight news…')+'</p></div>'+window.BEFNCoverage.panel(activeSport()));
 const h=newsPageHelpers();
 const intl=window.BEFNNewsPage.languageHTML(window.BEFNNewsPage.usableLanguageStories(desk.language,activeSport()),h,6);
 return renderFrame('<div class="np">'+head+window.BEFNNewsPage.leadsHTML(leads,h)+intl
  +'<section id="news-feed" aria-label="Latest fight news">'+renderNewsFeed()+'</section></div>'+window.BEFNCoverage.panel(activeSport()));
}
document.addEventListener('click',e=>{if(e.target.closest('#desk-updates')&&desk.pending){const {n,e:events}=desk.pending;Object.assign(desk,n,{events:events.events,reviewedAt:events.reviewedAt,pending:null});navigate();}});
setInterval(()=>loadDesk(true),5*60*1000);
setInterval(()=>{if(document.hidden)return;document.querySelectorAll('[data-updated-at] span').forEach(el=>{const v=agoText(el.parentElement.dataset.updatedAt);if(v&&el.textContent!==v)el.textContent=v});},30000);
setInterval(()=>{if(document.hidden)return;document.querySelectorAll('[data-mat-start]').forEach(el=>{const v=window.FightTime.relative(el.dataset.matStart);if(el.textContent!==v)el.textContent=v;});document.querySelectorAll('[data-mat-status]').forEach(el=>{const event=desk.events.find(item=>item.id===el.dataset.matStatus);if(!event)return;const html=window.EventStatus?.badge(event)||'';if(el.innerHTML!==html)el.innerHTML=html;});},15000);

function defenceLabel(value){return Number.isInteger(value)&&value>=0?`${value} ${value===1?'Defence':'Defences'}`:'Defences unverified';}
function previousReignsLine(c){
 const arr=Array.isArray(c.previousReigns)?c.previousReigns:[];
 if(!arr.length)return '';
 const full=arr.every(r=>/^\d{4}-\d{2}-\d{2}$/.test(r.start)&&/^\d{4}-\d{2}-\d{2}$/.test(r.end));
 if(!full)return '<small class="reign-line prior-unverified">Previous: dates unverified</small>';
 const days=arr.reduce((a,r)=>a+Math.round((Date.parse(r.end+'T00:00:00Z')-Date.parse(r.start+'T00:00:00Z'))/86400000),0);
 const count=arr.length,defences=arr.every(r=>Number.isInteger(r.defences))?arr.reduce((a,r)=>a+r.defences,0):null;
 const label=count+' earlier '+(count===1?'reign':'reigns');
 const suffix=defences===null?'Defences unverified':defenceLabel(defences);
 const u=arr[0].source;
 const src=u&&/^https:\/\//.test(u)?` <a class="reign-source" target="_blank" rel="noopener noreferrer" href="${esc(u)}" aria-label="View earlier title reign source">↗</a>`:'';
 const divisions=[...new Set(arr.map(r=>r.division).filter(Boolean))].join(', ');
 return `<small class="reign-line">Previous (${label}): ${days.toLocaleString('en-AU')} days · ${suffix}${src}</small>`;
}
function champsTable(){if(state.champions==='boxing')return `<div class="champ-table-wrap"><table class="champ-table"><thead><tr><th>Division</th>${['WBA','WBC','IBF','WBO','The Ring'].map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${D.champions.boxing.map(row=>`<tr><td class="division-head">${esc(row.division)}</td>${['WBA','WBC','IBF','WBO','Ring'].map(b=>`<td>${(row.belts[b]||[]).map(c=>`<div class="champ-cell">${c.name.toLowerCase()==='vacant'?'':champThumb(c.name,c.photo)}<div><b>${c.name.toLowerCase()==='vacant'?esc(c.name):champPeek(c.name,c.photo)}</b>${c.days?`<small class="reign-line">Current: ${esc(c.days)} · ${defenceLabel(c.defences)}${c.status?` ${esc(c.status)}`:''}</small>${previousReignsLine(c)}`:(c.status?`<small>${esc(c.status)}</small>`:'')}</div></div>`).join('')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
return `<div class="champ-table-wrap"><table class="champ-table"><thead><tr><th>Division</th><th>Titleholder</th><th>Reign began</th></tr></thead><tbody>${D.champions.mma.map(row=>`<tr><td class="division-head">${esc(row.division)}</td><td><div class="champ-cell">${champThumb(row.name,row.photo)}<div><b>${champPeek(row.name,row.photo)}</b><button type="button" class="befn-champion-profile-link" data-fighter="mma-champion--${row.name.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")}" aria-label="Open researched fighter profile for ${esc(row.name)}">Full fighter profile</button><small class="reign-line">Current: ${esc(reignDays(row)??row.days)} days · ${defenceLabel(row.defences)}</small>${previousReignsLine(row)}</div></div></td><td>${esc(row.start)}</td></tr>`).join('')}</tbody></table></div>`;}
function renderChampions(){
 const sport=state.champions;let listing='';
 if(sport==='grappling')listing='<div class="empty">Verified grappling championship standings are not yet available.</div>';
 else if(sport==='all'){
  state.champions='boxing';const boxing=champsTable();
  state.champions='mma';const mma=champsTable();state.champions=sport;
  listing='<section class="befn-champion-group"><h2>Boxing titleholders</h2>'+boxing+'</section><section class="befn-champion-group"><h2>MMA titleholders</h2>'+mma+'</section>';
 }else listing=champsTable();
 const scope=sport==='all'?'BOXING & MMA':sport==='boxing'?'13 WEIGHT DIVISIONS · FIVE BELT COLUMNS':sport==='mma'?'11 UFC DIVISIONS':'GRAPPLING';
 return renderFrame(viewTitle('','Champions')+'<div class="filter-row"><span class="result-count">'+scope+'</span></div>'+listing+`<details class="compact-note"><summary>Title statistics</summary><p>Current reign = the displayed title and division. A previous-reign total appears only where a recorded earlier reign was held in the same weight division and for the same boxing title organisation (or in the same UFC weight division). Multiple earlier reigns are combined into a single previous total. interim, regional and other-division titles are excluded. Historical days and successful defences are summed across qualifying earlier reigns, excluding title-winning bouts. Figures are dated archive snapshots, not live totals.</p></details>`);
}
const fighterCard=f=>`<button type="button" class="fighter-card" data-fighter="${esc(f.id)}" aria-label="View scouting profile for ${esc(f.name)}"><div class="fighter-image" data-fighter-portrait="${esc(f.name)}" data-portrait-state="fallback">${fighterPortraitFallback(f.name)}${f.photo?`<img src="${safeURL(f.photo)}" loading="lazy" referrerpolicy="no-referrer" alt="Photograph of ${esc(f.name)}">`:''}<span class="fighter-tag">${esc(f.category)}</span></div><div class="fighter-body"><div class="fighter-metadata">${esc(f.division)} · ${esc(f.sport)}</div><h3>${esc(f.name)}</h3><div class="fighter-metadata">${esc(f.record||'Record unconfirmed')}</div><p>${esc(f.analysis[0]||f.meta)}</p><div class="fighter-link">OPEN FULL SCOUTING REPORT ↗</div></div></button>`;
function filteredFighters(){let result=D.fighters.filter(f=>(state.fightersSport==='All'||f.sport===state.fightersSport) && (state.fightersCategory==='All'||f.category===state.fightersCategory) && (state.fightersDivision==='All'||scoutDivisionKey(f.division)===state.fightersDivision));const q=state.fightersQuery.trim().toLowerCase();if(q)result=result.filter(f=>[f.name,f.division,f.meta,f.record,f.next,...f.analysis].join(' ').toLowerCase().includes(q));return result;}
// Event-tagged divisions ("UFC 334 · Welterweight") and case variants
// ("Light heavyweight" / "Light Heavyweight") share one filter option.
function scoutDivisionName(d){return String(d||'').replace(/^UFC\s*\d+\s*·\s*/i,'').trim().replace(/(^|[\s-])([a-z])/g,(m,p,c)=>p+c.toUpperCase())}
function scoutDivisionKey(d){return scoutDivisionName(d).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'')}
function divisionFilter(){const seen=new Map();for(const x of D.fighters){if(state.fightersSport!=='All'&&x.sport!==state.fightersSport)continue;const k=scoutDivisionKey(x.division);if(k&&k!=='mma'&&!seen.has(k))seen.set(k,scoutDivisionName(x.division))}return `<select class="field" id="divisionFilter" aria-label="Choose weight division"><option value="All">All divisions</option>${[...seen].map(([k,d])=>`<option value="${esc(k)}" ${k===state.fightersDivision?'selected':''}>${esc(d)}</option>`).join('')}</select>`}
function renderFighterCards(){const list=filteredFighters();const grid=document.querySelector('#fighterGrid');const count=document.querySelector('#fighterCount');if(grid){grid.innerHTML=list.length?list.map(fighterCard).join(''):'<div class="empty">No fighters match those filters.</div>';syncFighterPortraits(grid)}if(count)count.textContent=`${list.length} PROFILES`}
function renderFighters(){const count=filteredFighters().length;return renderFrame(`<section class="fighters-unified">${viewTitle('','Fighter profiles')}<div class="filter-row">${segments('fightersCategory',['All','Champion','Contender','Prospect','Roster','Unassessed'],state.fightersCategory)}${divisionFilter()}<input class="field search" id="fighterSearch" placeholder="Search fighter, promotion, style, form…" aria-label="Search fighter profiles" value="${esc(state.fightersQuery)}"><span class="result-count" id="fighterCount">${count} PROFILES</span></div><details class="compact-note"><summary>About these records</summary><p>Historical roster from 7 November 2026. Some records, fixtures and notes require reconfirmation.</p></details><div class="fighters-grid" id="fighterGrid">${filteredFighters().length?filteredFighters().map(fighterCard).join(''):'<p class="empty">No verified scouting profiles are available for this selection.</p>'}</div></section>`)}
function renderLeaderboards(){return renderFrame(`<section class="fighters-unified befn-boards-unified">${viewTitle('','UFC stats')}<p class="befn-board-lede">Leaderboards from every UFC fight with full round-by-round statistics. Pick a board, a division and a time window.</p><section class="befn-stat-board-page" data-befn-v3-leaderboards aria-live="polite"><p class="befn-board-placeholder">Loading UFC statistics…</p></section></section>`)}
const talkPlatforms = {
 X: {mark:'𝕏', hosts:['x.com','twitter.com']},
 Instagram: {mark:'◎', hosts:['instagram.com']},
 Threads: {mark:'@', hosts:['threads.com','threads.net']},
 Bluesky: {mark:'🦋', hosts:['bsky.app']}
};
const talkSports = {all:'All sports', boxing:'Boxing', mma:'MMA', grappling:'Grappling'};
const talkRoles = {fighter:'Fighter', promoter:'Promoter', manager:'Manager', trainer:'Coach', team:'Fight team', commentator:'Commentator', media:'Media', fan:'Fan discussion',meme:'Meme page'};
const talkTiers = {champion:'Champion', contender:'Contender', prospect:'Prospect'};
const talkCounts = {likes:'likes', comments:'comments', shares:'reposts'};
const talkCutoffs = {Instagram:[5000,100], X:[500,50], Threads:[500,50], Bluesky:[30,10], Facebook:[500,50], Reddit:[100,30]};
const talkKey=s=>s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]/gu,'');
const rosterKey=(sport,name)=>sport.toLowerCase()+':'+talkKey(name);
const talkRoster=new Map(D.fighters.map(f=>[rosterKey(f.sport,f.name),f.category.toLowerCase()]));
for(const [sport,divisions] of Object.entries(D.champions)){
 for(const division of divisions){
  const names=division.name?[division.name]:Object.values(division.belts).flat().map(belt=>belt.name);
  for(const name of names)if(name.toLowerCase()!=='vacant')talkRoster.set(rosterKey(sport,name),'champion');
 }
}

function talkFighterTier(p){
 if(p.role!=='fighter')return '';
 const tier=p.fighterTier||talkRoster.get(rosterKey(p.sport,p.name));
 return Object.hasOwn(talkTiers,tier)?tier:'';
}

const validTalkCount=value=>Number.isSafeInteger(value)&&value>=0;
function talkAttention(p){
 const [likeCutoff,commentCutoff]=talkCutoffs[p.platform]||[500,50];
 const {likes,comments,shares}=p.engagement||{};
 return Math.max(validTalkCount(likes)?likes/likeCutoff:0,validTalkCount(comments)?comments/commentCutoff:0,validTalkCount(shares)?shares/likeCutoff:0);
}

function talkEngagement(p){
 const compact=new Intl.NumberFormat('en-AU',{notation:'compact',maximumFractionDigits:1});
 const counts=Object.entries(talkCounts).filter(([key])=>validTalkCount(p.engagement?.[key]));
 const checked=p.engagementCheckedAt?`Checked ${humanTalkTime(p.engagementCheckedAt)} local time`:'Counts from the source';
 return counts.length?`<div class="talk-engagement" title="${esc(checked)}">${counts.map(([key,label])=>{
  const rounded=Array.isArray(p.engagement.rounded)&&p.engagement.rounded.includes(key);
  return `<span title="${rounded?'About ':''}${p.engagement[key].toLocaleString('en-AU')} ${label}">${rounded?'≈':''}${compact.format(p.engagement[key])} ${label}</span>`;
 }).join('')}</div>`:'';
}

// Official public post widgets display the publisher's actual media, text and author.
// Fallbacks only quote original text known from the platform; never use a news summary.
let talkEmbedSequence=0;
let talkEmbedRender=0;
const talkBlueskyCidCache=new Map();
function talkBlueskyURI(p){
 const direct=String(p.id||'');
 if(/^at:\/\/did:[a-z0-9:]+\/app\.bsky\.feed\.post\/[a-z0-9]+$/i.test(direct))return direct;
 try{
  const postId=new URL(p.url).pathname.match(/\/post\/([a-z0-9]+)\/?$/i)?.[1];
  const did=String(p.verifiedDid||'');
  if(postId&&/^did:(?:plc|web):[a-z0-9.:%-]+$/i.test(did))
   return 'at://'+did+'/app.bsky.feed.post/'+postId;
 }catch{}
 return '';
}
function originalTalkPost(p){
 if(!talkDirectSource(p))return '<p class="talk-post-unavailable">This source is unavailable.</p>';
 const source=safeURL(p.url);
 const open='<a href="'+source+'" target="_blank" rel="noopener noreferrer" aria-label="Open post on '+esc(p.platform)+'">Open post on '+esc(p.platform)+' ↗</a>';
 const knownText=typeof p.quote==='string'&&p.quote.trim()?p.quote.trim():'';
 const fallback='<div class="talk-embed-fallback">'+(knownText?'<p class="talk-original-excerpt">'+esc(knownText)+'</p>':'<p>The official post cannot be displayed in this browser.</p>')+'<p>'+open+'</p></div>';
 if(p.platform==='Instagram'){
  // Instagram recognises canonical /p/ and /reel/ permalinks, not profile-prefixed variants.
  const match=new URL(p.url).pathname.match(/\/(p|reel)\/([a-zA-Z0-9_-]+)\/?/);
  if(!match)return '<div class="talk-native-static">'+fallback+'</div>';
  const canonical='https://www.instagram.com/'+match[1]+'/'+match[2]+'/';
  return '<div class="talk-original talk-instagram"><blockquote class="instagram-media" data-instgrm-permalink="'+canonical+'" data-instgrm-version="14" data-instgrm-captioned>'+open+'</blockquote>'+fallback+'</div>';
 }
 if(p.platform==='Threads'){
  const shortCode=new URL(p.url).pathname.match(/\/(?:post|t)\/([a-zA-Z0-9_-]+)\/?$/)?.[1];
  if(!shortCode)return '<div class="talk-native-static">'+fallback+'</div>';
  // Match the official Threads oEmbed markup. Each post appears only once per page.
  const id='ig-tp-'+shortCode;
  return '<div class="talk-original talk-threads"><blockquote class="text-post-media" id="'+id+'" data-text-post-permalink="'+source+'" data-text-post-version="0" data-theme="light">'+open+'</blockquote>'+fallback+'</div>';
 }
 if(p.platform==='X'){
  return '<div class="talk-original talk-x"><blockquote class="twitter-tweet" data-dnt="true" data-theme="light">'+open+'</blockquote>'+fallback+'</div>';
 }
 if(p.platform==='Bluesky'){
  const uri=talkBlueskyURI(p),cached=String(p.cid||talkBlueskyCidCache.get(uri)||'');
  if(!uri)return '<div class="talk-native-static">'+fallback+'</div>';
  const validCid=/^baf[a-z0-9]{20,}$/i.test(cached);
  // The official Bluesky widget needs the post's AT URI and CID; resolve missing CIDs
  // from Bluesky's public API in one batch when older collected posts are displayed.
  const cls=validCid?'bluesky-embed':'talk-bsky-pending';
  const attributes='data-bluesky-uri="'+esc(uri)+'"'+(validCid?' data-bluesky-cid="'+esc(cached)+'"':'')+' data-bluesky-embed-color-mode="light"';
  const content=knownText?'<p>'+esc(knownText)+'</p>':'<p>View the original Bluesky post.</p>';
  return '<div class="talk-original talk-bluesky"><blockquote class="'+cls+'" '+attributes+'>'+content+'<p>'+open+'</p></blockquote></div>';
 }
 return '<div class="talk-native-static">'+fallback+'</div>';
}
function hydrateTalkEmbeds(){
 if(!document.getElementById('talk-results'))return;
 ++talkEmbedRender;
 const renderToken=talkEmbedRender;
 if(document.querySelector('.instagram-media')){
  if(window.instgrm?.Embeds?.process)window.instgrm.Embeds.process();
  else if(!document.getElementById('talk-instagram-widgets')){
   const script=document.createElement('script');script.id='talk-instagram-widgets';
   script.src='https://www.instagram.com/embed.js';script.async=true;
   script.onload=()=>window.instgrm?.Embeds?.process?.();
   script.onerror=()=>script.remove();document.head.appendChild(script);
  }
 }
 if(document.querySelector('.text-post-media')){
  if(window.instgrm?.Embeds?.process)window.instgrm.Embeds.process();
  if(!document.getElementById('talk-threads-widgets')){
   const script=document.createElement('script');script.id='talk-threads-widgets';
   script.src='https://www.threads.com/embed.js';script.async=true;
   script.onload=()=>window.instgrm?.Embeds?.process?.();
   script.onerror=()=>script.remove();document.head.appendChild(script);
  }
 }
 if(document.querySelector('.twitter-tweet')){
  if(window.twttr?.widgets)window.twttr.widgets.load(document.getElementById('talk-results'));
  else if(!document.getElementById('talk-x-widgets')){
   const script=document.createElement('script');script.id='talk-x-widgets';
   script.src='https://platform.twitter.com/widgets.js';script.async=true;
   script.onload=()=>window.twttr?.widgets?.load?.(document.getElementById('talk-results'));
   script.onerror=()=>script.remove();document.head.appendChild(script);
  }
 }
 const showBluesky=()=>{
  if(renderToken!==talkEmbedRender||!document.querySelector('blockquote.bluesky-embed'))return;
  // Bluesky's script scans the DOM when executed, so re-execute after feed pagination.
  document.getElementById('talk-bsky-widgets')?.remove();
  const script=document.createElement('script');script.id='talk-bsky-widgets';
  script.src='https://embed.bsky.app/static/embed.js';script.async=true;
  script.onerror=()=>script.remove();document.head.appendChild(script);
 };
 const pending=[...document.querySelectorAll('blockquote.talk-bsky-pending[data-bluesky-uri]')];
 if(!pending.length){showBluesky();return}
 const groups=[];
 for(let i=0;i<pending.length;i+=25)groups.push(pending.slice(i,i+25));
 Promise.all(groups.map(async group=>{
  const params=new URLSearchParams();
  group.forEach(el=>params.append('uris',el.getAttribute('data-bluesky-uri')));
  try{
   const response=await fetch('https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts?'+params,{signal:AbortSignal.timeout(7000)});
   if(!response.ok)return;
   const data=await response.json();
   for(const post of data.posts||[]){
    if(!/^baf[a-z0-9]{20,}$/i.test(post.cid||''))continue;
    talkBlueskyCidCache.set(post.uri,post.cid);
   }
  }catch{}
 })).then(()=>{
  if(renderToken!==talkEmbedRender)return;
  for(const el of pending){
   if(!el.isConnected)return;
   const cid=talkBlueskyCidCache.get(el.getAttribute('data-bluesky-uri'));
   if(!cid)continue;
   el.setAttribute('data-bluesky-cid',cid);
   el.classList.remove('talk-bsky-pending');
   el.classList.add('bluesky-embed');
  }
  showBluesky();
 }).catch(()=>{});
}

function talkDirectSource(p){
 try {
  const u=new URL(p.url);
  return u.protocol==='https:' && Boolean(talkPlatforms[p.platform]?.hosts.includes(u.hostname.replace(/^www\./,'')));
 } catch {return false}
}
function talkPlatformIcon(platform){
 const svg=(body)=>'<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+body+'</svg>';
 if(platform==='Instagram')return svg('<rect x="2.5" y="2.5" width="19" height="19" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.6" cy="6.5" r=".9" fill="currentColor" stroke="none"/>');
 if(platform==='Threads')return svg('<path d="M17.8 8.5C17.1 4.8 14.7 3 11.5 3 6.7 3 4.7 6.9 4.7 12c0 5.7 2.5 9 7 9 3.8 0 6.3-2.4 6.3-5.6 0-3.5-3-5.2-6.2-5.2-2.4 0-3.8 1.2-3.8 3 0 1.7 1.4 2.7 3.3 2.7 3.4 0 5.4-3 5.4-6.6 0-4.6-2.4-7.2-6.5-7.2"/>');
 if(platform==='Facebook')return '<strong aria-hidden="true" style="font:bold 20px Arial">f</strong>';
 if(platform==='Bluesky')return '<span aria-hidden="true" style="font-size:19px">🦋</span>';
 if(platform==='Reddit')return '<span aria-hidden="true" style="font-size:18px">●</span>';
 if(platform==='X')return '<span aria-hidden="true" style="font-size:19px;font-weight:600">𝕏</span>';
 return esc(platform);
}
function postCard(p){
 if(p.type==='thread'){
  const steps=Array.isArray(p.steps)?p.steps:[];
  return '<article class="social-card thread-card" data-platform="X">'
   +'<div class="social-head"><div class="social-author"><strong>Connected conversation</strong><small>'+esc(p.date)+'</small></div><span class="platform-letter" aria-hidden="true">𝕏</span></div>'
   +'<div class="thread-title">'+esc(p.title)+'</div>'
   +steps.map((st,i)=>'<div class="thread-step '+(i?'reply':'')+'">'+thumb(st.photo,st.name)+'<div><div class="social-author"><strong>'+esc(st.name)+' <span class="handle">'+esc(st.handle||'')+'</span></strong></div><p>'+esc(st.quote)+'</p></div></div>').join('')
   +'<div class="social-foot"><span>Reported exchange · X</span>'+(p.url?'<a class="social-source" href="'+safeURL(p.url)+'" target="_blank" rel="noopener noreferrer">Read coverage ↗</a>':'')+'</div></article>';
 }
 // An official embed already carries its own author, handle, timestamp and media.
 // Do not duplicate that information inside a second dark editorial card.
 const direct=talkDirectSource(p);
 if(direct&&['Instagram','Threads','X','Bluesky'].includes(p.platform))
  return '<article class="social-card talk-native-card" data-platform="'+esc(p.platform)+'">'+originalTalkPost(p)+'</article>';
 const when=p.postedAt?'<time datetime="'+esc(p.postedAt)+'">'+esc(humanTalkTime(p.postedAt))+'</time>':p.nativeEmbed?'<time datetime="'+esc(p.sourceLinkedAt)+'">Discovered in coverage '+esc(humanTalkTime(p.sourceLinkedAt))+'</time>':esc(p.date);
 const label=direct?'Open post':'Read coverage';
 return '<article class="social-card" data-platform="'+esc(p.platform)+'">'
  +'<div class="social-head">'+thumb(p.photo||(p.role==='fighter'&&typeof portraitURL==='function'?portraitURL(p.name):''),p.name)+'<div class="social-author"><strong title="'+esc(p.name)+'">'+esc(p.name)+'</strong>'+(p.handle?'<small title="'+esc(p.handle)+'">'+esc(p.handle)+'</small>':'')+'</div><span class="platform-letter" aria-hidden="true">'+talkPlatformIcon(p.platform)+'</span></div>'
  +originalTalkPost(p)
  +(p.nativeEmbed&&p.evidenceUrl?'<p class="talk-source-note">Original post linked by <a href="'+safeURL(p.evidenceUrl)+'" target="_blank" rel="noopener noreferrer">'+esc(p.sourcePublisher||'combat-sports coverage')+'</a>. The post date is shown by '+esc(p.platform)+'.</p>':'')
  +'<div class="social-foot"><span class="talk-card-time">'+when+' · '+esc(p.platform)+'</span>'+(p.url?'<a class="social-source" href="'+safeURL(p.url)+'" target="_blank" rel="noopener noreferrer" aria-label="'+label+' by '+esc(p.name)+' on '+esc(p.platform)+'">'+label+' ↗</a>':'<span class="social-status">Source link unavailable</span>')+'</div>'
  +'</article>';
}


const liveTalk={posts:[],primaryPosts:[],embedPosts:[],paidXPosts:[],paidXCheckedAt:null,embedCheckedAt:null,selected:[],checkedAt:null,platformStatus:[],directory:[],directoryCounts:null,loading:false,lastAttempt:0,error:''};
function rebuildTalkPosts(){
 liveTalk.posts=[...liveTalk.primaryPosts,...liveTalk.paidXPosts,...liveTalk.embedPosts];
 // A platform's account API can be unavailable while authentic original
 // source-linked post embeds are still available.
 for(const platform of new Set(liveTalk.embedPosts.map(p=>p.platform))){
  if(!liveTalk.platformStatus.some(p=>p.platform===platform&&p.state==='connected'))
   liveTalk.platformStatus.push({platform,state:'source-linked',message:'Original source-linked posts; no account API access required.'});
 }
}
function redrawTalkIfVisible(){
 if(location.hash.split('/')[0]==='#social'&&state.socialMode!=='archive')refreshTalkView();
}
const talkWindow=7*24*60*60*1000;
async function loadLiveTalk(){
 if(liveTalk.loading)return;
 liveTalk.loading=true;
 liveTalk.lastAttempt=Date.now();
 const root='https://raw.githubusercontent.com/lukejelkins-beep/Black-Eye-Fight-News/main/';
 const read=async(path)=>{
  try{
   const response=await fetch(path+'?fresh='+liveTalk.lastAttempt,{cache:'no-store',signal:AbortSignal.timeout(8000)});
   if(!response.ok)return null;
   const data=await response.json();
   return Array.isArray(data?.posts)?data:null;
  }catch{return null;}
 };
 const readRoster=async(path)=>{
  try{
   const response=await fetch(path+'?fresh='+liveTalk.lastAttempt,{cache:'no-store',signal:AbortSignal.timeout(8000)});
   if(!response.ok)return null;
   const data=await response.json();
   return Array.isArray(data?.fighters)?data:null;
  }catch{return null}
 };
 const feed='data/fight-talk-live.json';
 const picks='data/fight-talk-selected.json';
 const embeds='data/fight-talk-embedded.json';
 const xApiFeed='data/fight-talk-x-api.json';
 const directoryPath='data/fight-talk-roster.json';
 // Prefer same-origin JSON on mobile, while allowing GitHub to supply fresh data
 // without blocking the initial feed if a cross-origin request is slow or blocked.
 const firstUsable=async(promises)=>{
  try{return await Promise.any(promises.map(p=>p.then(data=>{
   if(!data)throw new Error('Feed unavailable');
   return data;
  })))}
  catch{return null}
 };
 const remoteFeed=read(root+feed);
 const remoteEmbeds=read(root+embeds);
 const remoteXApiFeed=read(root+xApiFeed);
 const [newest,selected,originalEmbeds,directory,originalXApi]=await Promise.all([
  firstUsable([read(feed),remoteFeed]),
  firstUsable([read(picks),read(root+picks)]),
  firstUsable([read(embeds),remoteEmbeds]),
  firstUsable([readRoster(directoryPath),readRoster(root+directoryPath)]),
  firstUsable([read(xApiFeed),remoteXApiFeed])
 ]);
 if(directory){
  liveTalk.directory=directory.fighters;
  liveTalk.directoryCounts=directory.counts||null;
 }

 if(newest){
  liveTalk.primaryPosts=newest.posts;
  liveTalk.checkedAt=newest.checkedAt;
  liveTalk.platformStatus=Array.isArray(newest.platformStatus)?newest.platformStatus:[];
 }
 if(originalEmbeds&&(!liveTalk.embedCheckedAt||
    Date.parse(originalEmbeds.checkedAt||originalEmbeds.attemptedAt)>Date.parse(liveTalk.embedCheckedAt))){
  liveTalk.embedPosts=originalEmbeds.posts;
  liveTalk.embedCheckedAt=originalEmbeds.checkedAt||originalEmbeds.attemptedAt||null;
 }
 if(originalXApi?.posts?.length){
  liveTalk.paidXPosts=originalXApi.posts;
  liveTalk.paidXCheckedAt=originalXApi.checkedAt||originalXApi.attemptedAt;
 }
 rebuildTalkPosts();
 if(selected)liveTalk.selected=selected.posts;
 liveTalk.error=(newest||selected)?'':'Automatic feed temporarily unavailable';
 liveTalk.loading=false;
 redrawTalkIfVisible();
 // An updated GitHub JSON can supersede the fast local copy without holding up
 // mobile rendering. Re-render only when the remote feed is actually newer.
 remoteFeed.then(remote=>{
  if(!remote||!(Date.parse(remote.checkedAt)>Date.parse(liveTalk.checkedAt||'')))return;
  liveTalk.primaryPosts=remote.posts;
  liveTalk.checkedAt=remote.checkedAt;
  liveTalk.platformStatus=Array.isArray(remote.platformStatus)?remote.platformStatus:[];
  rebuildTalkPosts();
  redrawTalkIfVisible();
 }).catch(()=>{});
 // Render's static JSON can lag behind 10-minute GitHub Actions commits.
 // Independently compare the raw GitHub embed feed and take whichever is newer.
 // This avoids a manual Render deploy for new Instagram/Threads/X originals.
 remoteEmbeds.then(remote=>{
  if(!remote||!(Date.parse(remote.checkedAt||remote.attemptedAt)>Date.parse(liveTalk.embedCheckedAt||'')))return;
  liveTalk.embedPosts=remote.posts;
  liveTalk.embedCheckedAt=remote.checkedAt||remote.attemptedAt;
  rebuildTalkPosts();
  redrawTalkIfVisible();
 }).catch(()=>{});
 // TwitterAPI.io original posts are read-only verified author posts.
 // Keep the latest GitHub dataset when Render static publication lags.
 remoteXApiFeed.then(remote=>{
  if(!remote||!(Date.parse(remote.checkedAt||remote.attemptedAt)>Date.parse(liveTalk.paidXCheckedAt||'')))return;
  liveTalk.paidXPosts=remote.posts;
  liveTalk.paidXCheckedAt=remote.checkedAt||remote.attemptedAt;
  rebuildTalkPosts();
  redrawTalkIfVisible();
 }).catch(()=>{});
}

const humanTalkTime=value=>{
 const date=new Date(value);
 if(!Number.isFinite(date.getTime()))return '';
 const day={day:'numeric',month:'short'};
 if(/^\d{4}-\d{2}-\d{2}$/.test(value))return date.toLocaleDateString('en-AU',{...day,timeZone:'UTC'});
 return window.FightTime.localDateTime(value);
};

function recentTalkPosts(windowDays=7){
 const now=Date.now();
 const posts=new Map();
 // Keep native original-post identities from selected sources, while still preferring fresh direct-source posts where available.
 for(const p of [...liveTalk.selected,...liveTalk.posts]){
  // Generic publisher-linked embeds lack readable on-page text and can render as empty frames.
  // Native embeds may contain the original caption even when the feed lacks text.
  const time=Date.parse(p?.postedAt||(p?.nativeEmbed?p?.sourceLinkedAt:''));
  if(p?.type!=='post'||!Object.hasOwn(talkPlatforms,p.platform)||!Object.hasOwn(talkSports,p.sport)||p.sport==='all'||typeof p.name!=='string'||!p.name.trim()||typeof (p.quote||p.summary)!=='string'||(!(p.quote||'').trim()&&!p.nativeEmbed)||!Number.isFinite(time)||time<now-windowDays*24*60*60*1000||time>now+30*60*1000)continue;
  try{
   const url=new URL(p.url);
   const {hosts}=talkPlatforms[p.platform];
   if(url.protocol!=='https:'||url.username||url.password||!hosts.includes(url.hostname.replace(/^www\./,'')))continue;
   const path=url.pathname.replace(/\/$/,'');
   const postId=p.platform==='X'?path.match(/\/status\/(\d+)$/)?.[1]:p.platform==='Instagram'?path.match(/\/(?:p|reel)\/([\w-]+)$/)?.[1]:path;
   if(postId){
    const key=p.platform+':'+postId;
    const existing=posts.get(key);
    if(p.nativeEmbed&&existing&&['Instagram','Threads','X'].includes(p.platform)&&
       !/^Original (Instagram|Threads) post$/.test(existing.name||''))continue;
    posts.set(key,p);
   }
  }catch{}
 }
 return [...posts.values()];
}

function diverseTalk(posts,mode='balanced'){
 const priority=p=>['fighter','promoter','manager','trainer','team'].includes(p.role)?0:['fan','meme'].includes(p.role)?2:1;
 const compare=(a,b)=>{
  if(mode==='engagement'){
   const difference=talkAttention(b)-talkAttention(a);
   if(difference)return difference;
  } else if(mode==='significant'&&(b.score||0)!==(a.score||0)){
   return (b.score||0)-(a.score||0);
  } else if(mode==='balanced'&&priority(a)!==priority(b)){
   return priority(a)-priority(b);
  }
  return Date.parse(b.postedAt||b.sourceLinkedAt||'')-Date.parse(a.postedAt||a.sourceLinkedAt||'')||0;
 };
 const byAuthor=new Map(),seen=new Set();
 for(const p of [...posts].sort(compare)){
  // Native Meta embeds disclose their actual author/caption in the platform widget.
  // Generic source labels and identical explanatory summaries are NOT evidence
  // that two independently verified post permalinks belong to one author.
  const author=p.nativeEmbed&&!p.handle?'original:'+String(p.url||''):talkKey(p.name||p.handle||'');
  const quote=String(p.quote||p.summary||'');
  const normalized=p.nativeEmbed?'original:'+String(p.url||''):talkKey(quote.replace(/https?:\/\/\S+/g,''));
  const bucket=byAuthor.get(author)||[];
  if(bucket.length>=(mode==='latest'?10:3)||(normalized&&seen.has(normalized)))continue;
  if(normalized)seen.add(normalized);
  bucket.push(p);
  byAuthor.set(author,bucket);
 }
 if(mode!=='balanced')return [...byAuthor.values()].flat().sort(compare);
 const buckets=[[],[],[]];
 // Round-robin between authors: no single account takes over a page.
 for(let round=0;round<3;round++)
  for(const authored of byAuthor.values()){
   const p=authored[round];
   if(p)buckets[priority(p)].push(p);
  }
 const mixed=[];
 // Show three fighters for every media/industry post when available, with fan posts rotating in.
 // Change platforms between adjacent cards where possible: X must not be buried behind a Bluesky block.
 let lastPlatform='';
 while(buckets.some(bucket=>bucket.length)){
  for(const category of [0,0,1,0,2]){
   const bucket=buckets[category];
   if(!bucket.length)continue;
   const otherPlatform=bucket.findIndex(p=>p.platform!==lastPlatform);
   const next=bucket.splice(otherPlatform>=0?otherPlatform:0,1)[0];
   mixed.push(next);
   lastPlatform=next.platform;
  }
 }
 return mixed;
}

function highlightTalkDate(p){
 if(p.postedAt)return Date.parse(p.postedAt);
 const match=String(p.date||'').match(/(\d{1,2})(?:[–-](\d{1,2}))?\s+([A-Za-z]{3})\s+(\d{4})/);
 return match?Date.parse((match[2]||match[1])+' '+match[3]+' '+match[4]):NaN;
}
function highlightedTalkPosts(){
 const now=Date.now(), start=now-28*24*60*60*1000;
 const posts=recentTalkPosts(28).filter(p=>{
  const date=Date.parse(p.postedAt||p.sourceLinkedAt);
  return Number.isFinite(date)&&date>=start&&date<=now+30*60*1000;
 });
 return diverseTalk(posts,'latest');
}

function talkFilter(id,label,options){
 return `<div class="talk-filter"><label for="${id}">${label}</label><select id="${id}" data-talk-filter>${Object.entries(options).map(([value,name])=>`<option value="${esc(value)}" ${value===state[id]?'selected':''}>${esc(name)}</option>`).join('')}</select></div>`;
}

function talkCoverage(posts){
 const statuses=liveTalk.platformStatus.filter(p=>Object.hasOwn(talkPlatforms,p.platform)).filter((p,i,all)=>all.findIndex(q=>q.platform===p.platform)===i);
 const automatic=statuses.filter(p=>p.state==='connected');
 const picked=new Set(posts.filter(p=>p.summary).map(p=>p.platform));
 const verifiedEmbeds=new Set(posts.filter(p=>p.nativeEmbed).map(p=>p.platform));
 return '<details class="talk-coverage" id="talk-coverage"><summary>Post sources</summary>'
  +'<p>Public post display uses the official platform widgets; it does not require a Meta App Review.</p>'
  +'<p>Automatic source discovery: '+(automatic.map(p=>esc(p.platform)).join(', ')||'awaiting a feed check')+'. Other posts are sourced from direct public links.</p>'
  +(verifiedEmbeds.size?'<p>Linked original post embeds: '+[...verifiedEmbeds].map(esc).join(', ')+'. Publication dates of reporting are not post dates.</p>':'')
  +(statuses.length?'<ul class="talk-platform-health">'+statuses.map(p=>{
    const mine=liveTalk.posts.filter(x=>x.platform===p.platform&&Date.parse(x.postedAt));
    const newest=mine.length?Math.max(...mine.map(x=>Date.parse(x.postedAt))):0;
    const ago=ms=>{const h=(Date.now()-ms)/36e5;return h<1?Math.max(1,Math.round(h*60))+' min ago':h<48?Math.round(h)+' h ago':Math.round(h/24)+' days ago'};
    const stale=newest&&(Date.now()-newest)>7*864e5;
    const paused=p.state==='unavailable';
    const state=paused?'Paused: the platform refused access, so no new posts are being read':p.state==='connected'?'Automatic collection active':p.state==='source-linked'?'Public post links only':'Not connected; direct embeds only';
    const checked=p.state==='connected'&&liveTalk.checkedAt&&Date.parse(liveTalk.checkedAt)?' · last check '+ago(Date.parse(liveTalk.checkedAt)):'';
    const latest=newest?' · newest post '+ago(newest)+(stale?' (older than 7 days, hidden from Live)':''):' · no posts held';
    return '<li><strong>'+esc(p.platform)+'</strong> · '+state+checked+latest+'</li>';
   }).join('')+'</ul>':'')
  +'</details>';
}

function talkAccountDirectory(){
 if(!liveTalk.directory.length)return '';
 const filtered=liveTalk.directory.filter(p=>state.social==='all'||p.sport===state.social);
 const tracked=filtered.filter(p=>Object.values(p.profiles||{}).some(Boolean));
 const platformName={X:'X',Instagram:'Instagram',Threads:'Threads'};
 const cards=filtered.map(p=>{
  const buttons=Object.entries(platformName).map(([id,label])=>{
   const profile=p.profiles?.[id];
   return profile?.url?'<a href="'+safeURL(profile.url)+'" target="_blank" rel="noopener noreferrer">'+label+' ↗</a>':'';
  }).filter(Boolean).join('');
  return '<div class="talk-account-row"><div><strong>'+esc(p.name)+'</strong><small>'+
   esc(p.tier||'fighter')+' · '+esc(p.sport||'')+'</small></div><div class="talk-account-links">'+
   (buttons||'<span>Profile not yet sourced</span>')+'</div></div>';
 }).join('');
 return '<details class="talk-account-directory"><summary>Fighter social profiles · '+tracked.length+' of '+
  filtered.length+' tracked</summary><p>Automatically researched profile references for the website roster. '+
  'A profile link is not proof of live timeline access. Unidentified accounts are never guessed.</p>'+
  '<div class="talk-account-list">'+cards+'</div></details>';
}



/* Promotion filter needs the announced cards (who is booked with UFC, ONE, PFL). Loaded once, only for the Fight Talk page. */
let talkCardIndex=null,talkCardsLoading=false;
function loadTalkCards(){
 if(talkCardIndex||talkCardsLoading||!window.BEFNTalkFilters)return;
 talkCardsLoading=true;
 fetch('data/upcoming-cards.json?t='+Math.floor(Date.now()/3600000),{cache:'no-store',signal:AbortSignal.timeout(12000)})
  .then(r=>r.ok?r.json():null)
  .then(d=>{if(d&&Array.isArray(d.events)){talkCardIndex=window.BEFNTalkFilters.cardIndex(d.events);if(location.hash==='#social'&&state.talkPromotion!=='all'&&state.social==='mma')refreshTalkView(undefined)}})
  .catch(()=>{}).finally(()=>{talkCardsLoading=false});
}
function renderSocial(){
 const highlights=state.socialMode==='highlights';
 loadTalkCards();
 const current=highlights?highlightedTalkPosts():recentTalkPosts();
 const options={all:'All platforms',...Object.fromEntries(Object.keys(talkPlatforms).map(platform=>[platform,platform]))};
 const visible=p=>(state.social==='all'||p.sport===state.social)
  &&(state.socialPlatform==='all'||p.platform===state.socialPlatform)
  &&(!window.BEFNTalkFilters||window.BEFNTalkFilters.filterPosts([p],{sport:state.social,promotion:state.talkPromotion,query:state.talkFighter},talkCardIndex).length>0)
  &&(state.talkRole==='all'||(state.talkRole==='fighters'?p.role==='fighter':state.talkRole==='fans'?p.role==='fan':state.talkRole==='memes'?p.role==='meme':['commentator','media','promoter','manager','trainer','team'].includes(p.role)||p.type==='thread'));
 const filtered=current.filter(visible);
 const list=diverseTalk(filtered,highlights?'latest':state.talkSort);
 const pageSize=20;
 const total=Math.max(1,Math.ceil(list.length/pageSize));
 state.socialPage=Math.min(total,Math.max(1,state.socialPage));
 const start=(state.socialPage-1)*pageSize;
 const freshness=highlights?'Highlights from the previous four weeks':liveTalk.error||(!liveTalk.lastAttempt||liveTalk.loading?'Checking fresh posts…':liveTalk.checkedAt?'Live feed checked '+humanTalkTime(liveTalk.checkedAt)+' local time':'Checking fresh posts…');
 const mode='<div class="segment" role="group" aria-label="Fight Talk view">'+[['latest','Latest posts'],['highlights','Last 4 weeks']].map(([value,label])=>'<button type="button" id="talk-'+value+'" data-segment="socialMode" data-value="'+value+'" aria-pressed="'+String(value===state.socialMode)+'">'+label+'</button>').join('')+'</div>';
 const promotionFilter=state.social==='mma'&&window.BEFNTalkFilters?talkFilter('talkPromotion','Promotion',window.BEFNTalkFilters.PROMOTIONS):'';
 const fighterFilter='<div class="talk-filter talk-filter-fighter"><label for="talkFighter">Fighter</label><input type="search" id="talkFighter" data-talk-search value="'+esc(state.talkFighter)+'" placeholder="Search by fighter" autocomplete="off" aria-label="Search posts by fighter"></div>';
 const filters=talkFilter('socialPlatform','Platform',options)+promotionFilter+fighterFilter
  +talkFilter('talkRole','Posts from',{all:'Everyone',fighters:'Fighters',media:'Media & industry',fans:'Fans',memes:'Meme pages'})+talkFilter('talkSort','Order',{latest:'Newest first',balanced:'Balanced feed'});
 const toolbar='<div class="talk-toolbar"><div class="talk-toolbar-top">'+mode+'<p class="talk-freshness">'+esc(freshness)+'</p></div><div class="talk-filters">'+filters+'</div></div>';
 const platformNeedsConnection=liveTalk.platformStatus.some(p=>p.platform===state.socialPlatform&&p.state==='not-connected')&&!current.some(p=>p.platform===state.socialPlatform);
 const empty='<div class="talk-empty"><h2>No posts match these filters</h2><p>'+
  (!highlights&&(!liveTalk.lastAttempt||liveTalk.loading)?'Checking for original posts from the past seven days.':!highlights&&platformNeedsConnection?'Automatic updates from '+esc(state.socialPlatform)+' need an approved source connection.':'Try a different sport, promotion, fighter or platform filter.')+'</p></div>';
 const pages=total>1?'<div class="pagination"><button type="button" data-page="prev" '+(state.socialPage===1?'disabled':'')+'>← Previous</button><span>Page '+state.socialPage+' of '+total+'</span><button type="button" data-page="next" '+(state.socialPage===total?'disabled':'')+'>Next →</button></div>':'';
 const count=total>1?(start+1)+'–'+Math.min(start+pageSize,list.length)+' of '+list.length+' posts':list.length+' post'+(list.length===1?'':'s');
 const title=highlights?'The last four weeks':'Latest fighter & promoter posts';
 const description=highlights?'Original fighter reactions and exchanges from the past 28 days.':'Original posts from fighters, champions, contenders, media and promoters.';
 const resultHead='<div class="talk-section-head"><div><h2>'+title+'</h2></div></div>';
 const mainSection='<section class="talk-section" aria-label="'+title+'">'+resultHead+(list.length?'<div class="social-grid">'+list.slice(start,start+pageSize).map(postCard).join('')+'</div>':empty)+pages+'</section>';
 const highlighted=highlights?[]:highlightedTalkPosts().filter(visible);
 const onPage=new Set(list.slice(start,start+pageSize).map(p=>p.url));
 const featured=highlighted.filter(p=>!onPage.has(p.url)).slice(0,4);
 const preview=featured.length?'<section class="talk-section" aria-label="Four-week Fight Talk highlights"><div class="talk-section-head"><div><div class="talk-section-eyebrow">BOXING · MMA · GRAPPLING</div><h2>Highlights · last 4 weeks</h2></div><button type="button" class="btn" data-segment="socialMode" data-value="highlights">All highlights ↗</button></div><div class="social-grid">'+featured.map(postCard).join('')+'</div></section>':'';
 return renderFrame(viewTitle('','Fight Talk')+toolbar+
  '<section id="talk-results" aria-label="Fight Talk posts" tabindex="-1"><div class="talk-results-head"><p class="talk-count" aria-live="polite">'+esc(count)+'</p>' +talkCoverage(current)+talkAccountDirectory()+'</div>'+mainSection+preview+'</section>');
}


function refreshTalkView(focusId=document.activeElement?.id,showResults=false){
 const coverageOpen=document.getElementById('talk-coverage')?.open;
 main.innerHTML=renderSocial();
 hydrateTalkEmbeds();
 if(coverageOpen)document.getElementById('talk-coverage')?.setAttribute('open','');
 const focus=showResults?document.getElementById('talk-results'):document.getElementById(focusId);
 focus?.focus({preventScroll:true});
 if(showResults)focus?.scrollIntoView({block:'start'});
 hydrateMissingPortraits().catch(()=>{});
}
/* Strip illustration initials only when followed by an exact indexed fighter name. */
const fixturePortraitCatalog=(()=>{
 try{return Object.keys(JSON.parse(document.getElementById('fighter-portrait-registry').textContent).fighters||{})}
 catch{return D.fighters.map(f=>f.name)}
})();
const fixtureEsc=s=>s.replace(/[|\\{}()[\]^$+*?.]/g,'\\$&');
const fixtureNames=fixturePortraitCatalog.sort((a,b)=>b.length-a.length);
const fixturePrefixPattern=new RegExp('(^|[^\\p{L}\\p{N}])([A-Z]{2,3})\\s+('+fixtureNames.map(fixtureEsc).join('|')+')(?=$|[^\\p{L}\\p{N}])','giu');
function fixtureCellText(value){
 return String(value??'').replace(fixturePrefixPattern,(all,leading,prefix,name)=>{
  const initials=name.split(/\s+/).slice(0,2).map(part=>part[0]||'').join('').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  return initials===prefix.toUpperCase()?leading+name:all;
 });
}
function tableHTML(t){return `<section class="calendar-block"><div class="subheader">${esc(t.label==='Upcoming cards'?'Fight cards & event status':t.label)}</div><div class="scroller"><table class="data-table"><thead><tr><th scope="col">Event status</th>${t.head.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map(row=>`<tr><td>${window.EventStatus.row(row)}</td>${row.map(v=>`<td>${esc(fixtureCellText(v))}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;}
function renderHighlights(){return window.FightFilm.render()+window.BEFNCoverage.panel(activeSport())}
function befnDivisionKey(s){return String(s||'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'')}
// Days held is counted live from the reign's start date ("15 Nov 2025") so it
// never goes stale between data refreshes; the stored count is the fallback.
function reignDays(r){
 const m=String(r?.start||'').trim().match(/^(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{4})$/);
 const months={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
 if(m&&m[2].toLowerCase() in months){
  const start=Date.UTC(Number(m[3]),months[m[2].toLowerCase()],Number(m[1]));
  const now=new Date(),today=Date.UTC(now.getFullYear(),now.getMonth(),now.getDate());
  const days=Math.round((today-start)/86400000);
  if(days>=0)return days;
 }
 const n=Number(r?.days);
 return String(r?.days??'').trim()!==''&&Number.isFinite(n)?n:null;
}
function befnTitleBelts(f){
 if(f.sport!=='MMA')return '';
 // Draw one belt for a documented current UFC title. Never infer titles in
 // other divisions from credentials or a previous reign in the same division.
 const current=(D.champions?.mma||[]).filter(x=>x.name===f.name&&befnDivisionKey(x.division)===befnDivisionKey(f.division));
 const verified=Array.isArray(f.ufcTitleDivisions)?f.ufcTitleDivisions.filter(x=>
  typeof x==='object'&&x?.verified===true&&x?.source&&x?.division):[];
 const named=[...current.map(x=>x.division),...verified.map(x=>x.division)];
 const divisions=named.filter((d,i)=>named.findIndex(x=>befnDivisionKey(x)===befnDivisionKey(d))===i);
 if(!divisions.length)return '';
 const belt='<svg aria-hidden="true" viewBox="0 0 50 26" width="39" height="22" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 8 13 5 18 8 32 8 37 5 48 8 48 18 37 21 32 18 18 18 13 21 2 18Z" fill="#40301C" stroke="#D0A450" stroke-width="1.5"/><path d="M18 5 32 5 37 13 32 21 18 21 13 13Z" fill="#DBB663" stroke="#FFF0B3" stroke-width="1.2"/><path d="M22 10H28L30 13 28 16H22L20 13Z" fill="#6D4B23"/></svg>';
 return '<div class="befn-title-belts" aria-label="Documented UFC championships">'+
 divisions.map(div=>'<span class="befn-title-belt" title="UFC '+esc(div)+' title" aria-label="UFC '+esc(div)+' title">'+belt+'<small>'+esc(div)+'</small></span>').join('')+'</div>';
}
function befnReign(f){
const r=(D.champions?.mma||[]).find(x=>x.name===f.name&&befnDivisionKey(x.division)===befnDivisionKey(f.division));
if(!r||f.sport!=='MMA'||f.category!=='Champion')return '';
const parts=[];
if(r.start)parts.push('<span><b>Reign began</b>'+esc(r.start)+'</span>');
const held=reignDays(r);if(held!==null)parts.push('<span><b>Days held</b>'+held+'</span>');
if(Number.isInteger(r.defences))parts.push('<span><b>Defences</b>'+r.defences+'</span>');
if(Array.isArray(r.previousReigns)&&r.previousReigns.length)parts.push('<span><b>Prior reigns</b>'+r.previousReigns.length+'</span>');
return parts.length?'<div class="befn-reign"><strong>UFC '+esc(r.division)+' title reign</strong><div>'+parts.join('')+'</div></div>':'';
}
const navGroup={highlights:'fights',champions:'fighters',leaderboards:'fighters'};
const subLinks={fighters:['Fighters',[['#fighters','Fighter scout','fighters'],['#champions','Champions','champions'],['#leaderboards','UFC stats','leaderboards']]],fights:['Fights',[['#fights','Upcoming and results','fights'],['#highlights','Fight film','highlights']]]};
function subNavHTML(key){const g=subLinks[navGroup[key]||key];return g?'<nav class="sh-sub" aria-label="'+g[0]+' sections">'+g[1].map(([href,label,k])=>'<a href="'+href+'"'+(k===key?' aria-current="page"':'')+'>'+label+'</a>').join('')+'</nav>':'';}
function renderAnalysis(){return renderFrame('<div class="np"><header class="np-head"><h1>Analysis</h1><p>Fight breakdowns for the biggest cards are on the way. Until then, see who is fighting next.</p></header><a class="np-button" href="#fights">See upcoming fights</a></div>');}
// Latest three headlines that name this fighter (exact or close spelling only; see assets/related-news.js).
function fighterRelatedNews(f){const rn=window.BEFNRelatedNews;if(!rn||!f||!Array.isArray(desk.articles))return '';return rn.relatedHTML(rn.relatedNews(desk.articles,[f.name],3),{esc,safeURL},{when:v=>new Date(v).toLocaleDateString('en-AU',{day:'numeric',month:'short'})});}
function openFighter(id){const f=D.fighters.find(x=>x.id===id);if(!f)return;const recent=f.latest||[];const picture=f.photo||portraitURL(f.name);const img=`<div class="befn-portrait-slot" data-fighter-portrait="${esc(f.name)}" data-portrait-state="fallback">${fighterPortraitFallback(f.name)}${picture?`<img loading="eager" src="${safeURL(picture)}" alt="Photograph of ${esc(f.name)}" referrerpolicy="no-referrer">`:''}</div>`;
 const ins=window.BEFNFighterInsights;
 const isUfc=!!ins?.hasV3(f);
 const next=f.nextVerified===true?(f.next||'To be announced'):'To be announced';
 const facts=[['Division',f.division],['Status',f.category],['Next fight',next]].filter(([,v])=>v);
 const legacy=!isUfc?`<section class="befn-pro-card" data-befn-legacy-results data-pro-section="fights"><header><h3>Five most recent results</h3></header>${recent.length?`<div class="scroller"><table class="data-table" data-befn-recent-results="${esc(f.id)}"><thead><tr><th>Date</th><th>Opponent</th><th>W/L</th><th>Method</th></tr></thead><tbody>${recent.map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(r.opponent)}</td><td>${esc(r.outcome)}</td><td>${esc(r.method)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="befn-pro-note">Recent results unavailable.</p>'}</section>`:'';
 document.querySelector('#fighter-dialog-content').innerHTML=`<div class="befn-pro">
<div class="befn-pro-bar"><button type="button" class="befn-pro-back" data-close-fighter>← Fighter Scout</button><span class="befn-pro-crumb">${esc([f.sport,f.division].filter(Boolean).join(' · '))}</span><button type="button" class="befn-pro-close" id="closeFighter" aria-label="Close fighter profile">×</button></div>
<header class="befn-pro-hero">
<div class="befn-pro-photo">${img}</div>
<div class="befn-pro-id"><small class="befn-pro-eyebrow">${esc([isUfc?'UFC':'',f.sport,f.division].filter(Boolean).join(' · '))}</small><h2>${esc(f.name)}</h2><div class="befn-pro-record"><strong>${esc(f.record||'—')}</strong><span>Pro record</span></div>${befnTitleBelts(f)}<dl class="befn-pro-facts">${facts.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>${befnReign(f)}<div class="befn-top-credentials" data-befn-top-credentials>${ins?.topCredentials(f)||''}</div></div>
<div class="befn-pro-rating" data-befn-pro-rating></div>
</header>
<nav class="befn-pro-nav" aria-label="Profile sections">${[['overview','Overview'],['ratings','Ratings'],['fights','Fights'],['stats','Stats'],['compare','Compare'],['profile','Profile']].map(([k,l])=>`<button type="button" data-pro-jump="${k}">${l}</button>`).join('')}</nav>
<div class="befn-pro-body">${ins?.renderProfile(f)||''}${legacy}${fighterRelatedNews(f)}</div>
</div>`;
 dialog.classList.remove('befn-v3-dialog');
 dialog.classList.add('befn-pro-dialog');
 ins?.layoutV3Dialog?.();
 syncFighterPortraits(dialog);
 if(dialog.showModal&&!dialog.open)dialog.showModal();else dialog.setAttribute('open','');
 dialog.scrollTop=0;}
function navigate(){let key=location.hash.replace('#','').split('/')[0]||'home';if(key==='news')key='home';if(key==='calendar'||key==='results'){fightDesk.view=key==='results'?'results':'upcoming';history.replaceState(null,'','#fights');key='fights';}const all=['home','champions','fighters','leaderboards','social','fights','highlights','analysis'];if(!all.includes(key))key='home';const pages={home:renderHome,champions:renderChampions,fighters:renderFighters,leaderboards:renderLeaderboards,social:renderSocial,fights:renderFights,highlights:renderHighlights,analysis:renderAnalysis};const sub=document.getElementById('sh-sub');if(sub)sub.innerHTML=subNavHTML(key);main.innerHTML=pages[key]();syncFighterPortraits(main);if(key==='highlights')window.FightFilm.load();hydrateTalkEmbeds();document.querySelectorAll('[data-nav]').forEach(x=>{const yes=x.dataset.nav===(navGroup[key]||key);x.classList.toggle('active',yes);if(yes)x.setAttribute('aria-current','page');else x.removeAttribute('aria-current')});if(location.hash.startsWith('#fighter/')){openFighter(decodeURIComponent(location.hash.slice(9)))}window.scrollTo({top:0,behavior:'instant'});hydrateMissingPortraits().catch(()=>{});if(key==='social'&&!liveTalk.loading&&Date.now()-liveTalk.lastAttempt>10*60*1000)loadLiveTalk().catch(()=>{});}
document.addEventListener('click',e=>{
 const fightButton=e.target.closest('button[data-fights-view],button[data-fights-promotion]');
 if(fightButton){
  if(fightButton.dataset.fightsView)fightDesk.view=fightButton.dataset.fightsView;
  if(fightButton.dataset.fightsPromotion)fightDesk.promotion=fightButton.dataset.fightsPromotion;
  main.innerHTML=renderFights();
  if(fightButton.dataset.fightsView)main.querySelector('[data-fights-view="'+fightDesk.view+'"]')?.focus({preventScroll:true});
  else main.querySelector('[data-fights-promotion="'+fightDesk.promotion+'"]')?.focus({preventScroll:true});
  return;
 }
 const segment=e.target.closest('button[data-segment]');
 if(segment){
  const {segment:name,value}=segment.dataset;
  state[name]=value;
  if(name==='socialMode'){
   state.socialPage=1;
   refreshTalkView(segment.id);
   if(Date.now()-liveTalk.lastAttempt>10*60*1000)loadLiveTalk().catch(()=>{});
   return;
  }
  if(name==='newsSort'){state.newsPage=1;const feed=document.getElementById('news-feed');if(feed){feed.innerHTML=renderNewsFeed();return;}}
  
  navigate();
  return;
 }
 if(e.target.closest('[data-news-more]')){state.newsPage++;const feed=document.getElementById('news-feed');if(feed)feed.innerHTML=renderNewsFeed();return;}
 const fighter=e.target.closest('[data-fighter]');
 if(fighter){openFighter(fighter.dataset.fighter);return;}
 if(e.target.closest('#closeFighter,[data-close-fighter]')){dialog.close?.();return;}
 const page=e.target.closest('button[data-page]');
 if(page){
  state.socialPage+=page.dataset.page==='next'?1:-1;
  refreshTalkView(undefined,true);
 }
});
document.addEventListener('input',e=>{if(e.target.id==='fights-event-search'){fightDesk.query=e.target.value;const panel=document.getElementById('fights-active-content');if(panel)panel.innerHTML=renderFightsContent();return;}if(e.target.id==='fighterSearch'){state.fightersQuery=e.target.value;renderFighterCards()}});
document.addEventListener('change',e=>{
 const {id,value}=e.target;
 if(e.target.matches('select[data-talk-filter]')){
  state[id]=value;
  state.socialPage=1;
  refreshTalkView(id);
 }
 if(e.target.matches('input[data-talk-search]')){
  state.talkFighter=value.trim();
  state.socialPage=1;
  refreshTalkView(id);
  const box=document.getElementById(id);if(box){box.focus({preventScroll:true});box.setSelectionRange?.(box.value.length,box.value.length)}
 }
 if(id==='divisionFilter'){
  state.fightersDivision=value;
  renderFighterCards();
 }
});
/* Handle host-blocked fighter photos without inventing an image or mislabelling identity. */
document.addEventListener('error',e=>{
 const img=e.target;
 if(img.tagName!=='IMG')return;
 const box=img.closest('[data-hover-fighter],[data-image-for]');
 const card=img.closest('.fighter-card');
 const fighter=card?D.fighters.find(f=>f.id===card.dataset.fighter):null;
 const name=box?.dataset.hoverFighter||box?.dataset.imageFor||fighter?.name||(img.alt||'').match(/^Photograph of (.+)$/)?.[1]||'';
 const portrait=img.closest('[data-fighter-portrait]');
 if(portrait){
  // Reviewed fighter portraits fall back to an honest named placeholder,
  // never to an unverified Wikipedia namesake or an invisible broken image.
  portrait.classList.remove('is-loaded');
  portrait.dataset.portraitState='fallback';
  img.classList.add('is-error');
  return;
 }
 const isFighterImage=!!img.closest('.fighter-image,.dialog-bio,.champ-cell');
 if(name&&isFighterImage&&!img.dataset.wikiRetry){
  img.dataset.wikiRetry='1';
  findWikipediaPortrait(name).then(url=>{
   if(!url||url===img.src)throw Error('No safe alternative');
   img.classList.remove('is-error');
   img.src=url;
  }).catch(()=>{
   img.classList.add('is-error');
   const parent=img.closest('.card-photo');
   if(parent)parent.classList.add('no-photo');
  });
  return;
 }
 img.classList.add('is-error');
 const parent=img.closest('.card-photo');
 if(parent)parent.classList.add('no-photo');
},true);
document.addEventListener('load',e=>{const img=e.target;if(img.tagName!=='IMG')return;
 const frame=img.closest('[data-fighter-portrait]');
 if(frame&&img.complete&&img.naturalWidth>0){img.classList.remove('is-error');frame.classList.add('is-loaded');frame.dataset.portraitState='image'}
 const ratio=img.naturalWidth/Math.max(1,img.naturalHeight);if(ratio<.69&&img.closest('.fighter-image,.dialog-bio,.card-photo'))img.classList.add('photo-contain');
if(ratio<.8&&img.closest('.thumb'))img.style.objectPosition='50% 6%';},true);
window.addEventListener('hashchange',navigate);
if('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
 window.addEventListener('load',()=>{
  if(location.hostname==='befn-responsive-preview.onrender.com'){
   navigator.serviceWorker.getRegistrations().then(registrations=>registrations.forEach(reg=>reg.unregister())).catch(()=>{});
   if('caches' in window)caches.keys().then(names=>Promise.all(names.filter(n=>n.startsWith('befn-app-shell-')).map(n=>caches.delete(n)))).catch(()=>{});
  } else navigator.serviceWorker.register('./sw.js').catch(()=>{});
 });
}
document.addEventListener('befn:sport-change',()=>{syncGlobalSport();navigate()});
loadDesk();
navigate();
window.setInterval(()=>{if(location.hash.split('/')[0]==='#social'&&!liveTalk.loading)loadLiveTalk().catch(()=>{})},10*60*1000);

/* One viewport-aware preview outside scrolling tables. Hover/mouse, keyboard focus and touch. */
(function(){
 const popup=document.createElement('aside');
 popup.id='fighter-photo-preview';popup.setAttribute('role','tooltip');popup.setAttribute('aria-hidden','true');
 popup.innerHTML='<button type="button" class="fighter-preview-close" aria-label="Close fighter photo" title="Close photo">&times;</button><div class="fighter-preview-image"></div><div class="fighter-preview-name"></div><div class="fighter-preview-hint">PHOTO PREVIEW</div>';
 document.body.appendChild(popup);
 const imageBox=popup.querySelector('.fighter-preview-image');
 const label=popup.querySelector('.fighter-preview-name');
 const closeButton=popup.querySelector('.fighter-preview-close');
 let active=null,seq=0,pinned=false,loaded='';
 const target=e=>e&&e.closest?e.closest('.fighter-hover-name,.champ-preview-trigger'):null;
 function position(button){
  const rect=button.getBoundingClientRect();const w=popup.offsetWidth||440,h=popup.offsetHeight||375,gap=18,margin=12;
  let left=rect.right+gap;
  if(left+w>innerWidth-margin)left=rect.left-w-gap;
  if(left<margin)left=Math.max(margin,Math.min(innerWidth-w-margin,rect.left+(rect.width-w)/2));
  let top=rect.top-60;
  if(top+h>innerHeight-margin)top=innerHeight-h-margin;
  if(top<margin)top=margin;
  popup.style.left=Math.round(left)+'px';popup.style.top=Math.round(top)+'px';
 }
 function show(button,locked){
  if(!button)return;
  const same=active===button&&popup.classList.contains('is-open');
  if(!same){if(active)active.removeAttribute('aria-expanded');active=button;seq++;loaded='';}
  pinned=!!locked;popup.classList.toggle('is-pinned',pinned);popup.setAttribute('role',pinned?'dialog':'tooltip');button.setAttribute('aria-expanded','true');
  label.textContent=button.dataset.hoverFighter||button.dataset.imageFor||button.textContent.trim();
  popup.classList.add('is-open');popup.setAttribute('aria-hidden','false');
  if(!same) {
    imageBox.replaceChildren();
    const empty=document.createElement('span');empty.className='fighter-preview-empty';empty.textContent='Finding photograph…';imageBox.appendChild(empty);
    const token=seq;
    const source=button.dataset.hoverPhoto||portraitURL(label.textContent);
    const request=source?Promise.resolve(source):findWikipediaPortrait(label.textContent);
    Promise.resolve(request).then(url=>{
      if(token!==seq||!active)return;
      imageBox.replaceChildren();
      if(!url){const empty=document.createElement('div');empty.className='fighter-preview-empty';empty.textContent='Photograph unavailable';imageBox.appendChild(empty);return;}
      const img=new Image();img.alt='Photograph of '+label.textContent;img.referrerPolicy='no-referrer';img.decoding='async';
      img.onload=()=>{if(token===seq){imageBox.replaceChildren(img);position(button)}};
      img.onerror=()=>{
        if(token!==seq)return;
        findWikipediaPortrait(label.textContent).then(other=>{
          if(!other||other===url)throw Error('No verified fallback');
          const backup=new Image();backup.alt='Photograph of '+label.textContent;backup.referrerPolicy='no-referrer';
          backup.onload=()=>{if(token===seq){imageBox.replaceChildren(backup);position(button)}};
          backup.onerror=()=>{if(token===seq)imageBox.textContent='Photograph currently unavailable'};
          backup.src=other;
        }).catch(()=>{if(token===seq)imageBox.textContent='Photograph currently unavailable'});
      };
      img.src=url;loaded=url;
    }).catch(()=>{if(token===seq)imageBox.textContent='Photograph unavailable'});
  }
  position(button);
 }
 function hide(force){
  if(pinned&&!force)return;
  seq++;if(active){active.removeAttribute('aria-expanded');active=null;}
  pinned=false;popup.classList.remove('is-open','is-pinned');popup.setAttribute('role','tooltip');popup.setAttribute('aria-hidden','true');imageBox.replaceChildren();
 }
 closeButton.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();hide(true)});
 document.addEventListener('pointerover',e=>{if(e.pointerType==='touch')return;const b=target(e.target);if(b&&b!==active)show(b,false)});
 document.addEventListener('pointerout',e=>{if(e.pointerType==='touch')return;const b=target(e.target);if(b&&b===active&&!pinned&&(!e.relatedTarget||!b.contains(e.relatedTarget)))hide(true)});
 document.addEventListener('focusin',e=>{const b=target(e.target);if(b)show(b,false)});
 document.addEventListener('focusout',e=>{const b=target(e.target);if(b&&b===active&&!pinned)hide(true)});
 document.addEventListener('click',e=>{if(e.target.closest?.('#fighter-photo-preview'))return;const b=target(e.target);if(b){if(pinned&&active===b){hide(true)}else show(b,true);return;}if(active)hide(true)});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')hide(true)});
 window.addEventListener('resize',()=>{if(active)position(active)});
 document.addEventListener('scroll',()=>{if(active){if(pinned)position(active);else hide(true)}},true);
 window.addEventListener('hashchange',()=>hide(true));
})();

})();
