# Mimer

Hämtar miljöbeslut från [miljöbeslut.se](https://miljobeslut.se) och sparar dem lokalt.

## Användning

```bash
# Hämta alla beslut och spara som JSON (standard)
python fetch_miljobeslut.py

# Hämta alla beslut och spara till en specifik fil
python fetch_miljobeslut.py --output beslut.json

# Hämta beslut i CSV-format
python fetch_miljobeslut.py --format csv --output beslut.csv

# Sök efter specifika beslut
python fetch_miljobeslut.py --search "vattenverksamhet"

# Filtrera på beslutsmyndighet
python fetch_miljobeslut.py --authority "Länsstyrelsen"
```

## Alternativ

| Flagga | Kortform | Beskrivning | Standard |
|--------|----------|-------------|---------|
| `--format` | | Utdataformat: `json` eller `csv` | `json` |
| `--output` | `-o` | Sökväg till utdatafilen | `miljobeslut.json` |
| `--search` | `-s` | Fritextsökning | |
| `--authority` | `-a` | Filtrera på beslutsmyndighet | |

## Krav

Python 3.10 eller senare. Inga externa beroenden – enbart standardbiblioteket.
