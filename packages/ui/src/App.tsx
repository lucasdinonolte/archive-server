import { useState } from 'react';

import { FileGrid } from './components/FileGrid/FileGrid.tsx';
import { FileDetail } from './components/FileDetail/FileDetail.tsx';

export function App() {
  const [selectedHash, setSelectedHash] = useState<string | null>(null);

  if (selectedHash) {
    return (
      <FileDetail hash={selectedHash} onBack={() => setSelectedHash(null)} />
    );
  }

  return <FileGrid onSelect={setSelectedHash} />;
}
