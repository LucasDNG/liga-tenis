# Auditoría longitudinal de categorías — 2026-09-20

## Pregunta
¿La regla simétrica `#1 + 3 victorias asciende / última + 3 derrotas desciende` mantiene poblaciones razonablemente estables durante años?

## Hallazgo
No del todo. En simulaciones sin altas/bajas externas apareció una corriente neta hacia categorías superiores. La causa no es una sola fórmula: intervienen el intercambio de posiciones, las rachas y, especialmente, la asimetría de entrada (ascendido al fondo; descendido base #2).

## Por qué no usar 5 derrotas consecutivas
Haría el problema peor. Para una pareja con probabilidad 50% de perder, el tiempo esperado hasta 3 derrotas consecutivas es 14 partidos; hasta 5 consecutivas es 62. Con 60% de probabilidad de perder, pasa aproximadamente de 9,1 a 29,6 partidos. Es decir: cinco consecutivas reduce demasiado el flujo descendente.

## Regla elegida
- normal: última + 3 derrotas consecutivas;
- si la categoría tiene **5 o más parejas activas que la inmediatamente inferior**: última + 2 derrotas consecutivas;
- 7ª no desciende.

Es una válvula de presión local. No fija cupos ni mueve parejas administrativamente: el descenso sigue necesitando derrotas deportivas. Solo acelera el descenso cuando aparece un desnivel grande entre categorías vecinas.

## Prueba Monte Carlo
Modelo reproducible en `scripts/simulate-category-balance.js` (`npm run simulate:balance`).

Configuración:
- 7 categorías;
- 12 parejas iniciales por categoría;
- 120 corridas por escenario;
- 20 años por corrida;
- una rueda aproximada por mes;
- diferencias de habilidad latente 0, 0,7 y 1,0 entre categorías.

Resultados del candidato `5.0.9`:

- skill gap 0,0 — regla base: `[20,3; 15,3; 12,7; 11,9; 10,1; 7,5; 6,2]`; válvula: `[10,9; 11,3; 12,0; 12,0; 12,2; 12,8; 12,7]`.
- skill gap 0,7 — regla base: `[21,7; 15,9; 12,6; 11,3; 9,3; 7,4; 5,8]`; válvula: `[11,4; 11,4; 11,7; 12,1; 12,8; 12,2; 12,4]`.
- skill gap 1,0 — regla base: `[22,6; 15,5; 12,8; 10,3; 9,1; 7,3; 6,4]`; válvula: `[12,1; 11,9; 11,9; 12,2; 11,6; 11,8; 12,4]`.

En esas mismas corridas, la tasa de que alguna categoría quedara vacía al menos una vez bajó de 18,3%/15,0%/11,7% con la regla base a 1,7%/0,0%/0,8% con la válvula. Las promociones y descensos medios también quedaron casi balanceados con la nueva regla.

## Interpretación
No es una predicción de la liga real: no modela altas, bajas, lesiones, pausas, disponibilidad ni comportamiento humano completo. Sí es suficiente como prueba estructural para detectar deriva y comparar reglas bajo las mismas condiciones.

## Decisión
Adoptar la válvula `gap >= 5 => 2 derrotas`; mantener 3 derrotas en condiciones normales. No adoptar 5 derrotas consecutivas.


## Auditoría ampliada 5/10/20 años

El simulador fue ampliado para comparar seis variantes con las mismas 120 semillas, 12 parejas iniciales por categoría y skill gaps 0 / 0,7 / 1,0.

Métricas:
- población final media por categoría;
- ascensos y descensos acumulados;
- porcentaje de corridas donde alguna categoría quedó vacía;
- RMSE respecto de 12 parejas/categoría como medida de estabilidad;
- diferencia Primera menos 7ª como indicador de dirección de la deriva.

### Matemática de la hipótesis R5

Para probabilidad de derrota p, el tiempo esperado hasta k derrotas consecutivas es `(1-p^k)/((1-p)p^k)`.

- p=0,50: 3 derrotas => 14 partidos; 5 => 62.
- p=0,60: 3 => 9,1; 5 => 29,7.
- p=0,70: 3 => 6,4; 5 => 16,5.

### Resultado agregado sobre los tres skill gaps

| Horizonte | Variante | Población 1ª→7ª | P | R | Alguna vacía | RMSE | 1ª−7ª |
|---|---|---|---:|---:|---:|---:|---:|
| 5 | P3/R3 fijo | [14,6; 13,1; 12,0; 11,8; 12,0; 11,1; 9,5] | 126,5 | 107,0 | 2,5% | 4,51 | +5,1 |
| 5 | P3/R5 fijo | [30,9; 12,8; 11,7; 12,1; 9,6; 5,1; 1,9] | 133,0 | 28,5 | 0,8% | 9,21 | +29,0 |
| 5 | gap>=4 | [11,4; 11,7; 11,7; 11,9; 12,2; 12,8; 12,3] | 126,0 | 131,5 | 0,0% | 2,88 | -0,9 |
| 5 | gap>=5 | [11,7; 12,1; 11,8; 11,6; 12,2; 12,1; 12,5] | 125,7 | 128,5 | 0,3% | 3,07 | -0,8 |
| 5 | gap>=6 | [12,2; 12,5; 11,7; 12,0; 12,2; 11,7; 11,7] | 126,1 | 123,6 | 0,8% | 3,20 | +0,5 |
| 5 | P4/R3 fijo | [5,6; 9,9; 11,7; 12,2; 12,2; 12,8; 19,6] | 72,3 | 120,5 | 1,7% | 5,57 | -14,0 |
| 10 | P3/R3 fijo | [17,0; 14,2; 12,4; 11,7; 11,1; 9,5; 8,0] | 251,0 | 213,4 | 6,4% | 5,15 | +9,0 |
| 10 | P3/R5 fijo | [48,5; 13,7; 10,2; 6,2; 2,9; 1,4; 1,1] | 229,5 | 55,6 | 20,8% | 15,79 | +47,4 |
| 10 | gap>=4 | [11,1; 11,1; 11,5; 12,1; 12,2; 12,6; 13,3] | 252,8 | 263,2 | 0,0% | 3,02 | -2,2 |
| 10 | gap>=5 | [11,4; 12,1; 11,6; 11,8; 12,1; 12,4; 12,6] | 252,0 | 256,7 | 0,6% | 3,16 | -1,2 |
| 10 | gap>=6 | [12,3; 12,5; 12,2; 12,0; 12,2; 11,7; 11,2] | 253,1 | 248,2 | 1,4% | 3,25 | +1,1 |
| 10 | P4/R3 fijo | [3,6; 6,2; 9,7; 11,6; 12,4; 14,9; 25,6] | 144,8 | 230,8 | 3,9% | 7,67 | -22,0 |
| 20 | P3/R3 fijo | [21,5; 15,6; 12,7; 11,2; 9,5; 7,4; 6,1] | 489,7 | 423,9 | 15,0% | 6,74 | +15,4 |
| 20 | P3/R5 fijo | [71,6; 6,2; 1,9; 1,2; 1,0; 1,0; 1,0] | 320,0 | 96,9 | 50,3% | 24,44 | +70,6 |
| 20 | gap>=4 | [10,2; 10,6; 11,3; 12,2; 12,7; 12,8; 14,2] | 505,4 | 523,1 | 1,1% | 3,32 | -3,9 |
| 20 | gap>=5 | [11,5; 11,5; 11,9; 12,1; 12,2; 12,3; 12,5] | 504,4 | 509,3 | 0,8% | 3,22 | -1,1 |
| 20 | gap>=6 | [12,6; 12,4; 12,6; 11,9; 11,7; 11,7; 11,1] | 504,9 | 497,9 | 2,5% | 3,42 | +1,5 |
| 20 | P4/R3 fijo | [1,9; 2,9; 5,0; 8,2; 12,3; 18,1; 35,6] | 282,3 | 421,2 | 22,2% | 11,70 | -33,7 |

### Conclusión ampliada

- R5 queda descartado por cálculo y simulación.
- P4/R3 sobrecorrige hacia abajo.
- gap 4 sobrecorrige levemente a largo plazo.
- gap 6 deja deriva ascendente leve.
- gap 5 mantiene ascensos/descensos casi balanceados, menor RMSE a 20 años entre gap 4/5/6 y una diferencia Primera−7ª cercana a cero.

No se cambia la regla vigente.

Se agregó `tests/category-balance.test.js`; la suite pasa a 20/20 y cubre matemática de rachas, conservación de las 84 parejas a 5/10/20 años, rechazo de R5 y comparación de la válvula gap 5 contra gap 4/6.

Próximo paso: integración PostgreSQL/concurrencia del movimiento real. No se requieren simulaciones manuales de años de liga.
