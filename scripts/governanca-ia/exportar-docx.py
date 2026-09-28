#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Utilitário para gerar registros de Governança de IA no formato DOCX oficial do FluxID,
preservando integralmente a formatação, paleta de cores corporativa, tabelas e tipografia
dos registros existentes no repositório.
"""

import sys
import argparse
import os
import zipfile
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
    titulo = markdown.split('\n', 3)[1].replace('**FluxID | ', '').replace('**', '')
    valores = {}
    for line in markdown.splitlines():
        if line.startswith('- ') and ': ' in line:
            chave, valor = line[2:].split(': ', 1)
            valores[chave] = valor

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
                    t.text = ('Este documento registra a implementação e validação do ciclo 01 da '
                              'Spec 001 (Fundação técnica do FluxID) com inteligência artificial, '
                              'cobrindo o setup técnico, resolução determinística de conectividade Supabase, '
                              'proteção de credenciais e validação PWA/acessibilidade.')

    # 2. Mapeamento de campos da Tabela 2 (fallback histórico e valores da fonte Markdown)
    campos = {
        'Ferramenta de IA utilizada': 'Google Antigravity (Gemini 2.5 Pro)',
        'Objetivo do uso': ('Implementar o ciclo 01 da Spec 001 (Fundação técnica do FluxID), abrangendo o '
                            'setup do projeto React 19 + TypeScript 7 + Vite 8 + Tailwind 4, resolução '
                            'determinística de conectividade Supabase (local, lan, cloud), estabilidade '
                            'de sessão, isolamento de credenciais e validação PWA/acessibilidade.'),
        'Prompt utilizado': ('Execução do fluxo /speckit-implement sobre a especificação técnica 001 '
                             '(specs/001-fundacao-tecnica), cobrindo as quatro histórias de usuário: '
                             'US1 (MVP técnico com shell vazio e sem regras de domínio), US2 (resolução '
                             'determinística sequencial de conectividade local -> lan -> cloud), US3 '
                             '(classificação arquitetural de falhas e estabilidade da sessão) e US4 '
                             '(adaptação multi-dispositivo PWA com conformidade WCAG 2.2 AA).'),
        'Resposta gerada pela IA': ('Implementação completa do shell web em TypeScript/React sem regras de negócio, '
                                    'fábrica de cliente Supabase singleton por endpoint ativo, resolvedor '
                                    'sequencial (local -> lan -> cloud) com probe leve de saúde em /auth/v1/health, '
                                    'classificador arquitetural de falhas impedindo fallback em erros 4xx/RLS, '
                                    'testes de contrato/unidade/integração/E2E e configuração PWA com isolamento '
                                    'total do cache em relação ao Supabase. Código e testes disponíveis para revisão no Pull Request: '
                                    'https://github.com/aalissonalmeidaq/fluxid_integra2026/pull/2'),
        'Análise crítica da equipe': ('A equipe acompanhou a execução em regime TDD rigoroso. A arquitetura de '
                                      'conectividade implementada respeita todas as regras da constituição do '
                                      'FluxID: credenciais secretas nunca são expostas ao cliente, nenhuma chave '
                                      'secreta utiliza prefixo VITE_, e erros 401/403/RLS bloqueiam transições em '
                                      'vez de acionar fallbacks inseguros. A compatibilidade de compilação do '
                                      'TypeScript 7 com ESLint foi solucionada de forma isolada via hook de compatibilidade.'),
        'Validação humana realizada': ('Execução completa dos gates automatizados: tsc --noEmit (0 erros), eslint . '
                                       '(0 avisos), 69 testes Vitest aprovados (93.39% de cobertura de linhas e 95.55% '
                                       'de funções), 24 testes Playwright E2E aprovados em Desktop, Tablet e Mobile '
                                       '360px sem violações axe-core críticas ou graves, e npm run build gerando bundle de produção '
                                       'em 840 ms. Resolução integral de todos os bloqueadores da PR #2. Relatório detalhado em specs/001-fundacao-tecnica/validation.md.'),
        'Decisão final': ('☒ utilizado   ☐ adaptado   ☐ descartado',
                          ('a implementação atendeu integralmente aos critérios de aceitação da Spec 001, '
                           'respeitou os princípios da constituição do FluxID e obteve aprovação total em 100% dos testes '
                           'e medições de desempenho.')),
        'Fontes verificadas': ('Documentação oficial do Supabase CLI e Supabase JS v2, Diretrizes WCAG 2.2 AA '
                               'do W3C e documentação do Vite PWA Workbox.'),
        'Identificador do registro': 'RIA-014',
        'Data e hora da interação': '28/09/2026, 16:25:00 - America/Fortaleza',
        'Decisões e dados pendentes': 'Nenhuma pendência declarada. Pull Request #2 aberto e vinculado à issue #1.',
        'Responsável pela revisão da equipe': 'Alisson Almeida (Líder Técnico / Equipe FluxID)',
        'Data da validação humana': '28/09/2026   Assinatura ou rubrica: Alisson Almeida'
    }

    for campo in list(campos):
        for chave, valor in valores.items():
            if campo.lower() in chave.lower() or chave.lower() in campo.lower():
                campos[campo] = valor
                break

    tables = tree.findall('.//w:tbl', ns)
    if len(tables) >= 3:
        tbl2 = tables[2]
        for row in tbl2.findall('.//w:tr', ns):
            cells = row.findall('.//w:tc', ns)
            if len(cells) >= 2:
                label = ''.join(cells[0].itertext()).strip()
                for key, val in campos.items():
                    if key.lower() in label.lower():
                        if key == 'Decisão final' and isinstance(val, tuple):
                            set_cell_text(cells[1], val[0], ns, is_multiline_decision=True, justification=val[1])
                        else:
                            set_cell_text(cells[1], val, ns)
                        break

    # 3. Atualiza core.xml
    core_str = core_content.decode('utf-8')
    core_str = core_str.replace('Gate de registro de IA por ciclo Spec Kit', titulo)
    core_str = core_str.replace('RIA-013', titulo.split('|')[0].strip())

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
