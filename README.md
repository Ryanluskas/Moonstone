# Moonstone

Experiência web interativa em página única: uma tela de créditos com trilha sonora e som ambiente, que dá lugar a um mapa ilustrado com áreas clicáveis — cada área abre uma imagem em pop-up com tooltip. Feito em equipe como projeto pessoal/colaborativo.

**Equipe:** Desenvolvimento — Ryan, Wesley · Design — Emilly, Allana · Trilha sonora — Ryan

## Stack

- HTML, CSS e JavaScript puros (sem framework, sem build step)
- Áudio via elementos `<audio>` nativos (fade in/out programado em JS)

## Como rodar

Não há build nem dependências — é um site estático:

```bash
git clone https://github.com/Ryanluskas/Moonstone.git
cd Moonstone
# abra index.html direto no navegador, ou sirva localmente:
npx serve .
```

## Estrutura do projeto

```
index.html            # markup da tela de créditos + tela do mapa
style.css             # estilos (fundo animado, lua, estrelas, partículas)
script.js             # lógica: transição créditos → mapa, áudio, pop-ups, tooltips
mapa_moonstone.jpg     # imagem principal do mapa
moonstone_logo.png     # logo do projeto
lua_cartoon.png        # asset visual (lua)
imagens_popup/         # imagens exibidas ao clicar em cada área do mapa
vento_calmo.mp3         # som ambiente da tela de créditos
musica_mapa.mp3         # trilha sonora da tela do mapa
```

## Como funciona

1. Ao carregar, mostra os créditos do projeto com som de vento ao fundo.
2. Após alguns segundos (ou ao clicar), transiciona com fade de áudio para a tela do mapa, trocando a trilha sonora.
3. O mapa tem 3 áreas clicáveis ("Moonlight", "3 Beasts", "Capital") que exibem um tooltip e, ao clicar, abrem uma imagem da região em um pop-up modal.

## Status

Em desenvolvimento / projeto colaborativo — funcional como demo interativa.

## Sugestão de bio (descrição curta do repo)

> Experiência web interativa com mapa clicável, trilha sonora e créditos animados — projeto colaborativo.

## Topics sugeridos

`javascript` `html` `css` `interactive` `webaudio` `game` `frontend`
