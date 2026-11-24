# Initial research pass

24 November 2026

## Olympic candidate screen

Compared all 921 names and certificate slugs with athletes named in Olympedia’s MMA crossover index and the UFC’s historical Olympians feature. Used accent folding and normalized names for discovery. Verified the six matches against official competition records and UFC identity sources. The lists can miss aliases, newer fighters and people who competed in other sports. A nonmatch stays unreviewed. [Olympedia discovery index](https://www.olympedia.org/lists/231/manual) · [UFC discovery feature](https://www.ufc.com/news/olympians-who-have-competed-ufc-octagon)

| Fighter | Senior Olympic results |
| --- | --- |
| [Henry Cejudo](reviews/henry-cejudo.json) | Beijing 2008, USA, men’s freestyle wrestling 55 kg, gold. |
| [Kayla Harrison](reviews/kayla-harrison.json) | London 2012 and Rio 2016, USA, women’s judo −78 kg, two gold medals. |
| [Robelis Despaigne](reviews/robelis-despaigne.json) | London 2012, Cuba, men’s taekwondo +80 kg, bronze. |
| [Hamdy Abdelwahab](reviews/hamdy-abdelwahab.json) | Rio 2016, Egypt, men’s Greco-Roman wrestling 98 kg. His Singapore 2010 Youth Olympic silver is recorded separately. |
| [Javad Mahjoub](reviews/javad-mahjoub.json) | Rio 2016, Iran, men’s judo −100 kg. Tokyo 2020, Refugee Olympic Team, men’s judo +100 kg and mixed team. |
| [Gable Steveson](reviews/gable-steveson.json) | Tokyo 2020, USA, men’s freestyle wrestling 125 kg, gold. |

The seeds record six senior Olympic competitors, four medallists and five senior medals. The records for [Aaron Pico](reviews/aaron-pico.json), [Bo Nickal](reviews/bo-nickal.json) and [Tatiana Suarez](reviews/tatiana-suarez.json) separately establish trials credentials. Some famous former UFC Olympians fall outside this exact certificate snapshot.

## Commonwealth and national-team seeds

- [Michelle Montague](reviews/michelle-montague.json) competed for New Zealand at Birmingham 2022, placing seventh in women’s freestyle wrestling at 76 kg. She was selected and withdrew for Gold Coast 2018. [New Zealand Olympic Committee result](https://olympic.org.nz/athletes/michelle-montague)
- [Robert Whittaker](reviews/robert-whittaker.json) was selected to represent Australia at Gold Coast 2018 in men’s freestyle wrestling at 97 kg and withdrew before competing. [Commonwealth Games Australia withdrawal](https://commonwealthgames.com.au/whittaker-withdraws-from-gc2018/)
- The national lane starts with 12 fighters with verified competition appearances across judo, freestyle wrestling, combat sambo and amateur MMA. Results include both senior and age-group credentials. The same fighter can appear in more than one lane, so use the validator’s distinct counts and do not add them together. [IJF athlete result example](https://www.ijf.org/judoka/54/results?results_rank_group=all) · [UWW athlete result example](https://uww.org/athletes/montague-michelle-yvonne) · [IMMAF alumni discovery](https://immaf.org/about/immaf-alumni/)

## Remaining research

The first pass saved evidence for 17 distinct fighters. Each saved lane is still marked `seed`. The respective Commonwealth and national-team lanes have only been checked for the initial candidates. The next pass should screen official results/entry books, then work through every fighter in each lane in the pinned batch order. Use exact and alternate names, including different country or delegation labels. Scrutinize overlaps such as Movsar Evloev versus Olympic wrestler Musa Evloev. Preserve an explicit unresolved state on gaps and complete an independent source recheck before treating a batch as closed.
