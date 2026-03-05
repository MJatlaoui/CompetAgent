from src.database import init_db, get_pending, update_status
from src.persistence import write_to_battlecard


def run():
    init_db()
    pending = get_pending()
    print(f"[INFO] {len(pending)} pending insights (use web UI to approve)")


if __name__ == "__main__":
    run()
