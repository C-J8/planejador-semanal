"""Local administrative account setup. Passwords never appear in arguments/logs."""

import argparse
from getpass import getpass
from uuid import UUID

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from gym_tracker.config import get_settings
from gym_tracker.services.accounts import provision_account


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--user-id", type=UUID, required=True)
    parser.add_argument("--login", required=True)
    args = parser.parse_args()
    password = getpass("Senha (mínimo 12 caracteres): ")
    if password != getpass("Repita a senha: "):
        parser.error("As senhas não coincidem.")
    engine = create_engine(get_settings().database_url)
    try:
        with Session(engine) as session, session.begin():
            provision_account(session, args.user_id, args.login, password)
        print("Acesso criado para a pessoa existente. O histórico foi preservado.")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
