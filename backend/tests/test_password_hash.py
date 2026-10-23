"""Lösenordshashning: bcrypt 5 vägrar lösenord över 72 byte, bcrypt 4 kapade dem."""
from __future__ import annotations

from app.auth import hash_password, verify_password

# 120 tecken, 136 byte: längre än bcrypts 72 byte men inom schemats 128 tecken.
LANGT = "långt-lösenord-" * 8

# Gjorda med bcrypt 4.2.0, som i installationer före bcrypt 5.
GAMMAL_KORT = "$2b$04$kzFO4W0UApZnWiJymsnCLuLYDKNcR90E4z.LLK5I3qcgovW03bZSm"  # hemligt123
GAMMAL_LANG = "$2b$04$JrR68GqOzMhMqoTnK/kqzeApwJ3WMr9WlALU3xDIYyfXZPtexjRpa"  # LANGT


def test_hash_och_verifiera():
    h = hash_password("hemligt123")
    assert verify_password("hemligt123", h)
    assert not verify_password("hemligt124", h)


def test_langt_losenord_kan_sattas_och_anvandas():
    h = hash_password(LANGT)
    assert verify_password(LANGT, h)
    assert not verify_password("annat-" + LANGT, h)


def test_hashar_fran_bcrypt_4_verifieras():
    assert verify_password("hemligt123", GAMMAL_KORT)
    assert not verify_password("hemligt124", GAMMAL_KORT)
    assert verify_password(LANGT, GAMMAL_LANG)


def test_ogiltig_hash_ger_falskt():
    assert not verify_password("hemligt123", "inte-en-hash")
