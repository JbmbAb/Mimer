# Miljobeslut PostGIS Restoration Guide (Uppdaterad)

Jag har nu flyttat de tunga källfilerna till D: för att göra plats för importen i PostGIS på C:.

## Genomförda åtgärder
1. **Frigjort utrymme:** Flyttat `Geodata/` och `Kartor/` till `D:\MiljoBeslut_Produktdata_Sources`.
   - **C: Ledigt:** ~35 GB (Plats för databasen).
   - **D: Ledigt:** ~310 GB (Plats för källfiler).
2. **Strukturerat upp PostGIS:** Databasen har nu scheman: `sgu`, `lantmateriet`, `smhi`, `msb`, `sgi`, `app`.
3. **Ny Import-pipeline:** Skapat `IMPORT_PIPELINE_V2.ps1` i `03_Databas_PostGIS\docker`.

## Hur du importerar data nu
Du kör nu importen från D:-driven.

### Exempel: Importera jordarter (SGU)
```powershell
cd "C:\Users\jimmy\Desktop\MiljoBeslut_Produktdata\03_Databas_PostGIS\docker"
.\IMPORT_PIPELINE_V2.ps1 -TargetSchema sgu -SourceDir "D:\MiljoBeslut_Produktdata_Sources\Geodata\jordarter25k-100k"
```

### Exempel: Importera fastighetsdata (Lantmäteriet)
```powershell
.\IMPORT_PIPELINE_V2.ps1 -TargetSchema lantmateriet -SourceDir "D:\MiljoBeslut_Produktdata_Sources\Kartor\Fastighetsinformation Nedladdning"
```

### Exempel: Importera höjdmodeller (Lantmäteriet)
```powershell
.\IMPORT_PIPELINE_V2.ps1 -TargetSchema lantmateriet -SourceDir "D:\MiljoBeslut_Produktdata_Sources\Kartor\Markhojdmodell - XYZ-rutor - uttag 4100b5a8"
```

## Nästa Steg
1. **Import:** Kör kommandona ovan för att bygga upp databasen steg för steg.
2. **Kolla loggar:** Håll utkik efter [OK] i terminalen för att verifiera att filerna läses in korrekt.
