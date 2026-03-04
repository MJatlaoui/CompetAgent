from src.database import init_db, get_pending, update_status
from src.delivery import get_reactions, EMOJI_APPROVE, EMOJI_DISCARD
from src.persistence import write_to_battlecard


def run():
    init_db()
    pending = get_pending()
    print(f"[INFO] Checking {len(pending)} pending insights for reactions")

    for slack_ts, item_id, insight in pending:
        reactions = get_reactions(slack_ts)

        if EMOJI_APPROVE in reactions:
            print(f"[APPROVED] {insight['headline'][:60]}")
            write_to_battlecard(insight)
            update_status(slack_ts, "approved")

        elif EMOJI_DISCARD in reactions:
            print(f"[DISCARDED] {insight['headline'][:60]}")
            update_status(slack_ts, "discarded")


if __name__ == "__main__":
    run()
