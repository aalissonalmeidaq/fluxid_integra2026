"""Embute a pagina do portal de configuracao no firmware do lacre (Spec 013, research.md, item 10).

A pagina mora em firmware/portal/index.html, onde e testada no navegador (tests/e2e/portal-lacre.spec.ts). Antes de compilar o
ambiente esp32c3, este script gera firmware/src/PortalPagina.h (fora do git) com o conteudo numa string em PROGMEM, servida por
src/PortalWiFi.cpp. Nenhuma dependencia nova: e um extra_scripts do proprio PlatformIO (pre:ferramentas/embutir_portal.py).

Tambem roda sozinho, para conferir:
    python ferramentas/embutir_portal.py portal/index.html src/PortalPagina.h
"""

import os
import sys

DELIMITADOR = "FLUXIDPORTAL"


def embutir(origem: str, destino: str) -> int:
    with open(origem, "r", encoding="utf-8") as arquivo:
        pagina = arquivo.read()
    if f"){DELIMITADOR}\"" in pagina:
        raise SystemExit(f"A pagina contem o delimitador {DELIMITADOR}; troque-o em {__file__}.")
    conteudo = (
        "#pragma once\n\n"
        "// GERADO por ferramentas/embutir_portal.py a partir de portal/index.html. Nao edite: edite a pagina e compile de novo.\n\n"
        "#include <pgmspace.h>\n\n"
        f"static const char PORTAL_PAGINA[] PROGMEM = R\"{DELIMITADOR}({pagina}){DELIMITADOR}\";\n"
    )
    anterior = None
    if os.path.exists(destino):
        with open(destino, "r", encoding="utf-8") as arquivo:
            anterior = arquivo.read()
    # So reescreve quando muda, para nao recompilar o firmware inteiro a cada build.
    if anterior != conteudo:
        with open(destino, "w", encoding="utf-8", newline="\n") as arquivo:
            arquivo.write(conteudo)
    return len(pagina.encode("utf-8"))


def _no_platformio() -> None:
    Import("env")  # noqa: F821 - nome injetado pelo PlatformIO (SCons)
    projeto = env.subst("$PROJECT_DIR")  # noqa: F821
    tamanho = embutir(os.path.join(projeto, "portal", "index.html"), os.path.join(projeto, "src", "PortalPagina.h"))
    print(f"Portal do lacre embutido: {tamanho} bytes.")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    print(f"Portal do lacre embutido: {embutir(sys.argv[1], sys.argv[2])} bytes.")
else:
    _no_platformio()
