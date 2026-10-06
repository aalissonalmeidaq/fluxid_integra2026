#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Utilitário para gerar registros de Governança de IA no formato DOCX oficial do FluxID,
preservando integralmente a formatação, paleta de cores corporativa, tabelas e tipografia
dos registros existentes no repositório.
"""

import re
import copy
import sys
import argparse
import os
import zipfile
from datetime import datetime, timezone
import xml.etree.ElementTree as ET

def set_cell_text(tc, new_text, ns, is_multiline_decision=False, justification=''):
    """
    Substitui o texto preservando a formatação de w:pPr e w:rPr da célula original.
    """
    p_list = tc.findall('.//w:p', ns)
    if not p_list:
        return

    first_p = p_list[0]
    p_pr = first_p.find('./w:pPr', ns)

    # Encontra o primeiro run com texto para copiar seu rPr
    r_pr = None
    for r in first_p.findall('./w:r', ns):
        if r.find('./w:t', ns) is not None:
            r_pr = r.find('./w:rPr', ns)
            break

    # Remove todos os parágrafos existentes na célula
    for p in list(tc.findall('./w:p', ns)):
        tc.remove(p)

    if is_multiline_decision:
        # Parágrafo 1: Caixas de seleção
        p1 = ET.SubElement(tc, f"{{{ns['w']}}}p")
        if p_pr is not None:
            p1.append(ET.fromstring(ET.tostring(p_pr)))
        r1 = ET.SubElement(p1, f"{{{ns['w']}}}r")
        if r_pr is not None:
            r1.append(ET.fromstring(ET.tostring(r_pr)))
        t1 = ET.SubElement(r1, f"{{{ns['w']}}}t")
        t1.text = new_text

        # Parágrafo 2: Justificativa
        p2 = ET.SubElement(tc, f"{{{ns['w']}}}p")
        if p_pr is not None:
            p2.append(ET.fromstring(ET.tostring(p_pr)))
        r2 = ET.SubElement(p2, f"{{{ns['w']}}}r")
        if r_pr is not None:
            r2.append(ET.fromstring(ET.tostring(r_pr)))
        t2 = ET.SubElement(r2, f"{{{ns['w']}}}t")
        t2.text = f"Justificativa: {justification}"
    else:
        p = ET.SubElement(tc, f"{{{ns['w']}}}p")
        if p_pr is not None:
            p.append(ET.fromstring(ET.tostring(p_pr)))
        r = ET.SubElement(p, f"{{{ns['w']}}}r")
        if r_pr is not None:
            r.append(ET.fromstring(ET.tostring(r_pr)))
        t = ET.SubElement(r, f"{{{ns['w']}}}t")
        t.text = new_text


def gerar_docx(source_md, base_docx, out_registros):

    if not os.path.exists(base_docx):
        print(f"Arquivo base não encontrado: {base_docx}")
        sys.exit(1)

    with zipfile.ZipFile(base_docx, 'r') as zin:
        xml_content = zin.read('word/document.xml')
        core_content = zin.read('docProps/core.xml')
        all_files = {item.filename: zin.read(item.filename) for item in zin.infolist()}

    ET.register_namespace('w', 'http://schemas.openxmlformats.org/wordprocessingml/2006/main')
    ET.register_namespace('r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
    ET.register_namespace('m', 'http://schemas.openxmlformats.org/officeDocument/2006/math')
    ET.register_namespace('v', 'urn:schemas-microsoft-com:vml')
    ET.register_namespace('wp', 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing')
    ET.register_namespace('w10', 'urn:schemas-microsoft-com:office:word')
    ET.register_namespace('w14', 'http://schemas.microsoft.com/office/word/2010/wordml')

    ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
    tree = ET.fromstring(xml_content)

    with open(source_md, encoding='utf-8') as source:
        markdown = source.read()

    # Cabeçalho: **FluxID | RIA-NNN | Título**
    cabecalho = re.search(r'^\*\*FluxID \| (RIA-\d+) \| (.+?)\*\*\s*$', markdown, re.M)
    if not cabecalho:
        print('Cabeçalho "**FluxID | RIA-NNN | Título**" não encontrado no Markdown.')
        sys.exit(1)
    nome = cabecalho.group(2)
    titulo = f'{cabecalho.group(1)} | {nome}'

    valores = {}
    for line in markdown.splitlines():
        if line.startswith('- ') and ': ' in line:
            chave, valor = line[2:].split(': ', 1)
            valores[chave] = valor

    def valor(*prefixos):
        for prefixo in prefixos:
            for chave, conteudo in valores.items():
                if chave.lower().startswith(prefixo.lower()):
                    # O DOCX é texto corrido: sem a marcação de código do Markdown.
                    return conteudo.replace('`', '')
        return 'Não informado no registro.'

    def frase(texto):
        texto = texto.strip()
        return texto if texto.endswith(('.', '!', '?')) else texto + '.'

    def secao(titulo_secao):
        achado = re.search(rf'^## {re.escape(titulo_secao)}\s*\n(.*?)(?=^## |\Z)', markdown, re.M | re.S)
        return ' '.join(achado.group(1).split()) if achado else 'Não informado no registro.'

    link = re.search(r'^Link para validação da equipe:\s*(\S+)', markdown, re.M)
    resposta = valor('Resposta gerada pela IA')
    if link:
        resposta = f'{resposta} Link para validação da equipe: {link.group(1)}'

    decisao = valor('Decisão final').strip().lower()
    caixas = '   '.join(('☒ ' if decisao == opcao else '☐ ') + opcao for opcao in ('utilizado', 'adaptado', 'descartado'))

    spec = valor('Spec')
    ciclo = valor('Ciclo')

    # 1. Atualiza os parágrafos do cabeçalho
    for p in tree.findall('.//w:body/w:p', ns):
        text = ''.join(p.itertext()).strip()
        if 'RIA-013' in text:
            for t in p.findall('.//w:t', ns):
                if 'RIA-013' in (t.text or ''):
                    t.text = f'FluxID  |  {titulo}'
        elif text.startswith('Este documento registra'):
            for t in p.findall('.//w:t', ns):
                if t.text and 'Este documento registra' in t.text:
                    t.text = (f'Este documento registra a implementação e validação do ciclo {ciclo} da '
                              f'Spec {spec} ({nome}) com inteligência artificial.')

    # 2. Campos da Tabela 2: todos vêm do Markdown; nada é herdado de registros anteriores.
    campos = {
        'Ferramenta de IA utilizada': valor('Ferramenta de IA utilizada'),
        'Objetivo do uso': valor('Objetivo do uso'),
        'Prompt utilizado': valor('Prompt utilizado'),
        'Resposta gerada pela IA': resposta,
        'Análise crítica da equipe': valor('Análise crítica da equipe'),
        'Validação humana realizada': valor('Validação humana realizada'),
        'Decisão final': (caixas, valor('Justificativa')),
        'Fontes verificadas': valor('Fontes verificadas'),
        'Identificador do registro': valor('Identificador do registro'),
        'Data e hora da interação': valor('Data e hora da interação'),
        'Decisões e dados pendentes': secao('Decisões e dados pendentes'),
        'Responsável pela revisão da equipe': valor('Responsável pela revisão da equipe'),
        'Data da validação humana': valor('Data da validação humana'),
    }

    # Só os itens da seção "Arquivos e áreas afetadas" contam como arquivos do ciclo. O gerador do registro já deixa de fora os
    # arquivos administrativos de docs/governanca-ia (o próprio RIA e o índice), que não fazem parte da mudança funcional.
    achado_arquivos = re.search(r'^- Arquivos e áreas afetadas:\s*\n(.*?)(?=^## |\Z)', markdown, re.M | re.S)
    arquivos_afetados = len(re.findall(r'^- `', achado_arquivos.group(1), re.M)) if achado_arquivos else 0
    linhas_extras = [
        ('Rastreabilidade técnica',
         f"Repositório {valor('Repositório')}; branch {valor('Branch')}; Spec {spec}, ciclo {ciclo}; "
         f"commit-base {valor('Commit-base')}; hash do diff funcional {valor('Hash do diff funcional preparado')}."),
        ('Testes e evidências',
         f"Comandos: {frase(valor('Comando(s)'))} Resultado: {frase(valor('Resultado'))} Evidência: {frase(valor('Evidência'))}"),
        ('Arquivos e áreas afetadas',
         f'{arquivos_afetados} arquivos, sem contar os arquivos administrativos do próprio registro em docs/governanca-ia '
         '(o RIA e o índice). A lista completa está no Markdown de apoio do registro.'),
        ('Observações da validação humana', valor('Observações')),
    ]

    tables = tree.findall('.//w:tbl', ns)
    if len(tables) >= 3:
        tbl2 = tables[2]
        for row in tbl2.findall('.//w:tr', ns):
            cells = row.findall('.//w:tc', ns)
            if len(cells) >= 2:
                label = ''.join(cells[0].itertext()).strip()
                for key, val in campos.items():
                    if key.lower() in label.lower():
                        if key == 'Decisão final':
                            set_cell_text(cells[1], val[0], ns, is_multiline_decision=True, justification=val[1])
                        else:
                            set_cell_text(cells[1], val, ns)
                        break

        # Linhas novas, clonando a formatação da última linha da tabela.
        modelo = tbl2.findall('./w:tr', ns)[-1]
        for rotulo, conteudo in linhas_extras:
            linha = copy.deepcopy(modelo)
            celulas = linha.findall('.//w:tc', ns)
            set_cell_text(celulas[0], rotulo, ns)
            set_cell_text(celulas[1], conteudo, ns)
            tbl2.append(linha)

    # Checklist final: reflete o estado real do Markdown em vez de um texto fixo.
    itens_md = [(m.group(2).strip(), m.group(1).lower() == 'x')
                for m in re.finditer(r'^- \[([ xX])\] (.+)$', markdown, re.M)]
    if len(tables) >= 4:
        for tc in tables[3].findall('.//w:tc', ns):
            rotulo = ''.join(tc.itertext()).strip().lstrip('☒☐').strip()
            if not rotulo:
                continue
            marcado = any(item[:12].lower() == rotulo[:12].lower() and ok for item, ok in itens_md)
            set_cell_text(tc, f"{'☒' if marcado else '☐'} {rotulo}", ns)

    # 3. Atualiza core.xml
    core_str = core_content.decode('utf-8')
    # O título do modelo é "RIA-013 Gate de registro de IA por ciclo Spec Kit"; troca o conjunto para não duplicar o prefixo.
    core_str = core_str.replace('RIA-013 Gate de registro de IA por ciclo Spec Kit', titulo)
    core_str = core_str.replace('Gate de registro de IA por ciclo Spec Kit', titulo)
    core_str = core_str.replace('RIA-013', titulo.split('|')[0].strip())

    # Autoria e datas: nada de nomes ou datas herdados do modelo.
    agora = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    core_str = re.sub(r'<dc:creator>.*?</dc:creator>', '<dc:creator>Equipe FluxID</dc:creator>', core_str)
    core_str = re.sub(r'<lastModifiedBy>.*?</lastModifiedBy>', '<lastModifiedBy>Equipe FluxID</lastModifiedBy>', core_str)
    core_str = re.sub(r'<dc:description>.*?</dc:description>|<dc:description/>',
                      f'<dc:description>Registro de uso de IA e validação humana do ciclo {ciclo} da Spec {spec} do FluxID.</dc:description>', core_str)
    core_str = re.sub(r'(<dcterms:created[^>]*>).*?(</dcterms:created>)', rf'\g<1>{agora}\g<2>', core_str)
    core_str = re.sub(r'(<dcterms:modified[^>]*>).*?(</dcterms:modified>)', rf'\g<1>{agora}\g<2>', core_str)

    # Rodapés e cabeçalhos do modelo carregam o RIA-013: trocam pelo identificador deste registro.
    identificador = cabecalho.group(1)
    for nome_parte in list(all_files):
        if re.match(r'word/(footer|header)\d*\.xml$', nome_parte):
            all_files[nome_parte] = all_files[nome_parte].decode('utf-8').replace('RIA-013', identificador).encode('utf-8')

    # A miniatura do modelo mostra o RIA-013: sai do pacote, com a relação e o tipo de conteúdo dela.
    if 'docProps/thumbnail.jpeg' in all_files:
        del all_files['docProps/thumbnail.jpeg']
        all_files['_rels/.rels'] = re.sub(rb'<Relationship [^>]*thumbnail[^>]*/>', b'', all_files['_rels/.rels'])

    new_doc_xml = ET.tostring(tree, encoding='utf-8', xml_declaration=True)
    all_files['word/document.xml'] = new_doc_xml
    all_files['docProps/core.xml'] = core_str.encode('utf-8')

    os.makedirs(os.path.dirname(out_registros), exist_ok=True)
    with zipfile.ZipFile(out_registros, 'w', compression=zipfile.ZIP_DEFLATED) as zout:
        for fname, data in all_files.items():
            zout.writestr(fname, data)
    print(f"Registro DOCX gerado com sucesso: {out_registros}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True)
    parser.add_argument('--template', default='docs/governanca-ia/registros/13_Gate_de_Registro_de_IA_por_Ciclo_SpecKit.docx')
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    gerar_docx(args.source, args.template, args.output)
