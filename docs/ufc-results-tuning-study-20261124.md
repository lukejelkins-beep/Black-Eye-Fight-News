# Results-part tuning study (research, 24 Nov 2026; nothing on the site changes)

Live constants: `{"start": 1500, "k": 64, "boost": 1.0, "finish": 1.25, "split": 0.5, "idle": 0.1, "title": 1.5}`. Lower log loss is better.

## Who they beat: K (how far one fight moves a rating), finishes, split decisions, title fights

| Variant | 2016-2023 log loss / accuracy | 2024+ log loss / accuracy |
|---|---|---|
| live | 0.6510 / 61.7% (few-fight 0.6470, n=864) | 0.6631 / 59.7% (few-fight 0.6797, n=400) |
| k = 48 | 0.6527 / 62.0% (few-fight 0.6486, n=864) | 0.6654 / 59.5% (few-fight 0.6778, n=400) |
| k = 80 | 0.6526 / 61.8% (few-fight 0.6493, n=864) | 0.6631 / 60.0% (few-fight 0.6840, n=400) |
| finish = 1.0 | 0.6523 / 61.1% (few-fight 0.6480, n=864) | 0.6646 / 58.9% (few-fight 0.6810, n=400) |
| finish = 1.5 | 0.6517 / 62.1% (few-fight 0.6480, n=864) | 0.6634 / 59.5% (few-fight 0.6800, n=400) |
| split = 0.75 | 0.6515 / 61.1% (few-fight 0.6467, n=864) | 0.6648 / 60.1% (few-fight 0.6815, n=400) |
| split = 1.0 | 0.6525 / 61.2% (few-fight 0.6469, n=864) | 0.6671 / 58.9% (few-fight 0.6839, n=400) |
| title = 1.0 | 0.6505 / 61.6% (few-fight 0.6474, n=864) | 0.6624 / 59.7% (few-fight 0.6790, n=400) |
| title = 2.0 | 0.6524 / 62.1% (few-fight 0.6472, n=864) | 0.6646 / 59.7% (few-fight 0.6807, n=400) |
| boost = 0.0 | 0.6552 / 61.9% (few-fight 0.6525, n=864) | 0.6679 / 58.5% (few-fight 0.6823, n=400) |
| boost = 2.0 | 0.6547 / 61.4% (few-fight 0.6525, n=864) | 0.6644 / 60.2% (few-fight 0.6867, n=400) |

## Inactivity (drift back toward 1500 per year beyond one year out)

| Variant | 2016-2023 log loss / accuracy | 2024+ log loss / accuracy |
|---|---|---|
| idle = 0.0 | 0.6524 / 61.7% (few-fight 0.6481, n=864) | 0.6647 / 59.2% (few-fight 0.6813, n=400) |
| idle = 0.05 | 0.6515 / 61.6% (few-fight 0.6474, n=864) | 0.6638 / 59.8% (few-fight 0.6804, n=400) |
| idle = 0.1 (live) | 0.6510 / 61.7% (few-fight 0.6470, n=864) | 0.6631 / 59.7% (few-fight 0.6797, n=400) |
| idle = 0.2 | 0.6505 / 61.8% (few-fight 0.6467, n=864) | 0.6620 / 60.4% (few-fight 0.6785, n=400) |
| idle = 0.3 | 0.6505 / 62.3% (few-fight 0.6468, n=864) | 0.6610 / 61.0% (few-fight 0.6776, n=400) |

## Few-fight fighters: start from the pre-UFC record instead of 1500
Scored on bouts where both fighters have a saved record (debuts included). 'few-fight' = either fighter had fewer than 3 UFC fights before the bout.

| Variant | 2016-2023 log loss / accuracy | 2024+ log loss / accuracy |
|---|---|---|
| prior scale 0 (live: flat 1500) | 0.6855 / 55.8% (few-fight 0.6878, n=558) | 0.6629 / 60.1% (few-fight 0.6708, n=678) |
| prior scale 100 | 0.6845 / 56.1% (few-fight 0.6867, n=558) | 0.6612 / 59.9% (few-fight 0.6679, n=678) |
| prior scale 200 | 0.6837 / 56.3% (few-fight 0.6859, n=558) | 0.6597 / 60.4% (few-fight 0.6653, n=678) |
| prior scale 300 | 0.6831 / 56.6% (few-fight 0.6854, n=558) | 0.6584 / 60.3% (few-fight 0.6631, n=678) |
| prior scale 400 | 0.6828 / 55.9% (few-fight 0.6854, n=558) | 0.6572 / 60.6% (few-fight 0.6611, n=678) |

## Owner's choices and the result (24 Nov 2026)
Chosen via selector: pre-UFC start at scale 400, inactivity 30% a year, title fights stay 1.5x, mix stays 60/40 (blend re-fitted on 2019-2023: results 1.77, skills 1.203).

Mix test on 2024+ fights (before these choices): 50/50 Brier .2287, 60/40 .2296, 70/30 .2309; rank correlation with the official order .67, .73, .77. The 2019-2023 fit preferred 70/30, so the periods disagree; all within noise.

Result against the live engine (`scripts/ufc-rating-evaluate.py`, 1,134 fights from 2024): accuracy 61.5% to 62.7%, Brier .2296 to .2274 (improvement +0.0021, interval +0.0009 to +0.0035). Caveat: pre-UFC records exist only for fighters still active, so part of the 2024+ gain may be survivorship; the 2016-2023 test restricted to bouts where both fighters have a record also improved.
