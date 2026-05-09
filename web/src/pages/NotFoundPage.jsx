import { Link } from 'react-router-dom';
export default function NotFoundPage() {
  return (
    <div className="text-center py-16">
      <div className="text-3xl font-semibold mb-2">Not found</div>
      <Link to="/" className="text-fuchsia-400 hover:underline">Go home</Link>
    </div>
  );
}
