import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const roster=read('data/ufc-36-month-roster-approval.json');
const certificates=read('data/ufc-independent-full-career-verification.json');
const native=read('data/ufcalendar-rich-progress.json');
const cases={
  "bia-mesquita": {
    "id": "174",
    "sid": "eff9074bc066f0f2",
    "b": [
      [
        "65895",
        "Irina Alekseeva",
        "win",
        "546f971f9d8e0a33"
      ],
      [
        "60722",
        "Montse Rendon",
        "win",
        "8cab057e6549afd0"
      ],
      [
        "66004",
        "Melissa Mullins",
        "win",
        "c0980a613f24accd"
      ]
    ],
    "ex": []
  },
  "denys-bondar": {
    "id": "1069",
    "sid": "2526be54e6a0e62a",
    "b": [
      [
        "61633",
        "Malcolm Gordon",
        "loss",
        "1765fc442ea03873"
      ],
      [
        "60174",
        "Carlos Hernandez",
        "loss",
        "8ea12c7360fa0f6b"
      ],
      [
        "39038",
        "Ronaldo Rodriguez",
        "loss",
        "5e8c710f9f27aff8"
      ]
    ],
    "ex": []
  },
  "damian-pinas": {
    "id": "458",
    "sid": "fdd22e895a70e4a8",
    "b": [
      [
        "60685",
        "Wes Schultz",
        "win",
        "c6a85b67fdd2ef3d"
      ],
      [
        "66446",
        "Cesar Almeida",
        "win",
        "b223b10ef19f912c"
      ],
      [
        "83727",
        "Andrey Pulyaev",
        "win",
        "31b85cd63fb291ed"
      ]
    ],
    "ex": [
      [
        "88287",
        "Vitor Costa"
      ]
    ]
  },
  "connor-matthews": {
    "id": "2848",
    "sid": "36e78278a77006d4",
    "b": [
      [
        "38988",
        "Dennis Buzukja",
        "loss",
        "f59cefe16905d62c"
      ],
      [
        "60996",
        "Jose Delgado",
        "loss",
        "2a493f15e079a7ff"
      ],
      [
        "60847",
        "Yadier del Valle",
        "loss",
        "d6e2bc6e6c0cc4fe"
      ]
    ],
    "ex": [
      [
        "88250",
        "Francis Marshall"
      ],
      [
        "84099",
        "Jair Farias"
      ]
    ]
  },
  "changho-lee": {
    "id": "417",
    "sid": "117a06469813e4ef",
    "b": [
      [
        "38816",
        "Xiao Long",
        "win",
        "c0d6feef69ccb330"
      ],
      [
        "60298",
        "Cortavious Romious",
        "win",
        "fc3825dd1b67e39d"
      ],
      [
        "60425",
        "Timmy Cuamba",
        "loss",
        "58f6248da3cdf3ce"
      ]
    ],
    "ex": []
  },
  "blake-bilder": {
    "id": "2779",
    "sid": "5095b0920a3602aa",
    "b": [
      [
        "59741",
        "Shane Young",
        "win",
        "5c962ea13cb9b937"
      ],
      [
        "61340",
        "Kyle Nelson",
        "loss",
        "7ee8b91d7f80f8a7"
      ],
      [
        "59860",
        "JeongYeong Lee",
        "loss",
        "e1930496b33fa636"
      ]
    ],
    "ex": [
      [
        "88258",
        "Alex Morgan"
      ]
    ]
  },
  "erik-silva": {
    "id": "467",
    "sid": "21b813b919776d90",
    "b": [
      [
        "61234",
        "TJ Brown",
        "loss",
        "2d9d966e0e8df232"
      ],
      [
        "39040",
        "Muhammad Naimov",
        "loss",
        "50dae6b76c9c6490"
      ],
      [
        "60684",
        "Francis Marshall",
        "loss",
        "581292ffe5b09344"
      ]
    ],
    "ex": [
      [
        "83954",
        "Anvar Boynazarov"
      ]
    ]
  },
  "jean-paul-lebosnoyani": {
    "id": "479",
    "sid": "a3dda21be645be93",
    "b": [
      [
        "60670",
        "Phil Rowe",
        "win",
        "508e622130b0a84d"
      ],
      [
        "82954",
        "Seokhyeon Ko",
        "win",
        "f2eb569176e46edf"
      ],
      [
        "93264",
        "Farman Hasanov",
        "win",
        "a7b3c1386172d083"
      ]
    ],
    "ex": [
      [
        "84139",
        "Jack Congdon"
      ]
    ]
  },
  "jonathan-micallef": {
    "id": "325",
    "sid": "f782f953bfe7b5f2",
    "b": [
      [
        "60989",
        "Kevin Jousset",
        "win",
        "8bc8bb0021337de7"
      ],
      [
        "65855",
        "Oban Elliott",
        "win",
        "78912b78aa946375"
      ],
      [
        "66074",
        "Themba Gorimbo",
        "win",
        "7ac4ae301ed699ab"
      ]
    ],
    "ex": [
      [
        "84173",
        "Mohamed Ado"
      ]
    ]
  },
  "kiefer-crosbie": {
    "id": "272",
    "sid": "4729c93ba705a3bf",
    "b": [
      [
        "60064",
        "Kevin Jousset",
        "loss",
        "65c89e0c92e51bb8"
      ],
      [
        "61088",
        "Sam Patterson",
        "loss",
        "3183dfe66fcdd25f"
      ],
      [
        "65915",
        "Taiyilake Nueraji",
        "loss",
        "1452c20d964c0a63"
      ]
    ],
    "ex": []
  }
};
test('strict Stage3 wave17-18: ten distinct full careers retain 30 exact sourced UFC fights and native measured rounds',()=>{
 assert.equal(roster.status,'approved');
 assert.equal(roster.approvedFighters.length,783);
 assert.equal(new Set(roster.approvedFighters).size,783);
 let total=0;
 for(const [slug,c] of Object.entries(cases)){
  assert.ok(roster.approvedFighters.includes(slug),slug);
  const x=certificates.fighters[slug];
  assert.ok(x?.sourceCoverageAttested===true,slug);
  assert.equal(x.scope,'complete_official_ufc_career',slug);
  assert.equal(x.verificationMethod,'full_official_ufc_fight_listing_crosscheck',slug);
  assert.equal(x.sourceSnapshot?.sourceCommit,'c742842f29466758fedc3906dbad28d6d320a8da',slug);
  assert.equal(x.fighterUrl,'https://ufcstats.com/fighter-details/'+c.sid,slug);
  assert.deepEqual(x.verifiedNumericFighterIds,[c.id],slug);
  assert.equal(x.officialUfcCareerBoutCount,c.b.length,slug);
  assert.equal(x.bouts.length,c.b.length,slug);
  assert.equal(new Set(x.bouts.map(b=>b.nativeBoutId)).size,c.b.length,slug);
  for(let i=0;i<c.b.length;i++){
   const [id,opponent,result,sid]=c.b[i],b=x.bouts[i],n=native.bouts[id];
   assert.deepEqual([b.nativeBoutId,b.opponent,b.result,b.nativeFighterId],[id,opponent,result,c.id],slug);
   assert.equal(b.fightUrl,'https://ufcstats.com/fight-details/'+sid,slug);
   assert.ok(n&&n.org==='ufc'&&n.status==='completed',slug+':'+id);
   const own=n.a?.id===c.id?n.a:n.b?.id===c.id?n.b:null;
   const other=n.a?.id===c.id?n.b:n.a;
   assert.ok(own&&other,slug+':'+id);
   assert.equal(other.name,opponent,slug+':'+id);
   assert.equal(n.result?.winnerId===own.id?'win':n.result?.winnerId===other.id?'loss':null,result,slug+':'+id);
   assert.ok(native.roundDone[id],slug+':'+id);
   total++;
  }
 }
 assert.equal(total,30);
});
test('seven independently documented DWCS feeder bouts are excluded without silently removing native records',()=>{
 let count=0;
 for(const [slug,c] of Object.entries(cases)){
  const x=certificates.fighters[slug];
  const exclusions=x.sourceVerifiedExcludedFeederBouts||[];
  assert.deepEqual(exclusions.map(e=>e.nativeBoutId),c.ex.map(e=>e[0]),slug);
  for(const [id,opponent] of c.ex){
   const e=exclusions.find(t=>t.nativeBoutId===id);
   assert.equal(e.opponent,opponent,slug);
   assert.equal(e.officialSourceUrl,x.officialFighterUrl,slug);
   assert.ok(!x.bouts.some(b=>b.nativeBoutId===id),slug);
   if(native.bouts[id]) assert.match(native.bouts[id].event,/Contender Series/i,slug);
   count++;
  }
 }
 assert.equal(count,7);
});
test('special cases preserve official RTU final and reciprocal Farman Hasanov result',()=>{
 const lee=certificates.fighters['changho-lee'],j=certificates.fighters['jean-paul-lebosnoyani'],f=certificates.fighters['farman-hasanov'];
 assert.equal(lee.bouts[0].nativeBoutId,'38816');
 assert.equal(lee.bouts[0].result,'win');
 assert.ok(lee.sourceScopeVerified.includes('split'));
 const won=j.bouts.find(x=>x.nativeBoutId==='93264'),lost=f?.bouts?.find(x=>x.nativeBoutId==='93264');
 assert.ok(won&&lost);
 assert.equal(won.result,'win');assert.equal(lost.result,'loss');
 assert.equal(won.fightUrl,lost.fightUrl);
});
