# Simuluesi i Qarqeve

Ky është një projekt Vite + React + TypeScript për një editor dhe simulator qarqesh në shfletues.

## Çfarë përfshihet

- paletë për tokën, burimin e tensionit DC, burimin e tensionit AC, rezistorin, kondensatorin, induktorin, diodën dhe op-amp-in
- kanavacë skematike me SVG
- komponentë që lëvizen me miun dhe mund të rrotullohen
- krijim telash duke klikuar pin me pin
- panel inspektori për ndryshimin e vlerave të komponentëve
- eksport i netlistës në stil SPICE
- simulim për OP, tranzient dhe AC sweep

## Ekzekutimi

```bash
npm install
npm run dev
```

## Shënime

- Motori i simulimit është i integruar në projekt.
- Telat janë point-to-point me paraqitje ortogonale.
- Op-amp-i eksportohet si burim tensioni i kontrolluar nga tensioni në netlistë.
