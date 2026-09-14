import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="page not-found">
      <span className="eyebrow">404 / NOT FOUND</span>
      <h1>요청한 화면을 찾을 수 없습니다.</h1>
      <p>주소를 확인하거나 대시보드로 돌아가 주세요.</p>
      <Link className="primary-button" to="/">
        대시보드로 이동
      </Link>
    </div>
  );
}
