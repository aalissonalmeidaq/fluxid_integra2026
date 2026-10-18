"""Gera o pacote de certificados raiz do lacre (firmware/certificados/x509_crt_bundle.bin).

O lacre confere o certificado do FluxID (HTTPS sem setInsecure, Spec 012, research.md, item 16) com as raizes da lista do
Mozilla, no formato que o WiFiClientSecure do arduino-esp32 2.0 le (esp_crt_bundle.c): um contador de 2 bytes e, para cada
raiz, o tamanho do nome e da chave (2 bytes cada), o nome (subject DER) e a chave publica (SubjectPublicKeyInfo DER),
ordenados pelo nome, porque o lacre procura o emissor por busca binaria.

Uso (precisa do pacote "cryptography"):
    curl -sSo cacert.pem https://curl.se/ca/cacert.pem
    python gerar_pacote_certificados.py cacert.pem ../certificados/x509_crt_bundle.bin

Gere de novo quando a lista do Mozilla mudar (uma vez por ano, ou se uma autoridade do Supabase mudar) e grave o lacre.
"""

import hashlib
import struct
import sys

from cryptography import x509
from cryptography.hazmat.primitives import serialization


def gerar(origem: str, destino: str) -> None:
    with open(origem, "rb") as arquivo:
        conteudo = arquivo.read()
    certificados = x509.load_pem_x509_certificates(conteudo)
    entradas = {}
    for certificado in certificados:
        nome = certificado.subject.public_bytes()
        chave = certificado.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
        entradas[(nome, chave)] = True
    ordenadas = sorted(entradas.keys(), key=lambda entrada: entrada[0])
    pacote = struct.pack(">H", len(ordenadas))
    for nome, chave in ordenadas:
        pacote += struct.pack(">HH", len(nome), len(chave)) + nome + chave
    with open(destino, "wb") as arquivo:
        arquivo.write(pacote)
    print(f"{len(ordenadas)} raizes, {len(pacote)} bytes; origem sha256 {hashlib.sha256(conteudo).hexdigest()}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)
    gerar(sys.argv[1], sys.argv[2])
