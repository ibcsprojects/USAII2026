import { useEffect } from 'react'
import { useStore } from './state/store'
import { Header } from './components/Header'
import { Banner } from './components/Banner'
import { FlagList } from './components/FlagList'
import { ApplyAllBar } from './components/ApplyAllBar'

export default function App() {
  const init = useStore((s) => s.init)

  useEffect(() => {
    init()
  }, [init])

  return (
    <div className="flex h-full flex-col bg-leaf-50">
      <Header />
      <Banner />
      <main className="flex-1 overflow-y-auto">
        <FlagList />
      </main>
      <ApplyAllBar />
    </div>
  )
}
