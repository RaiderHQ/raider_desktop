import React, { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import useProjectStore from '@foundation/Stores/projectStore'
import PieChartWidget from '@components/PieChartWidget'
import TestResultCard from '@components/TestResultCard'

interface Attachment {
  name: string
  type: string
  source: string
}

interface TestResult {
  name: string
  status: string
  attachments?: Attachment[]
  screenshot?: string
}

const Dashboard: React.FC = (): JSX.Element => {
  const [results, setResults] = useState<TestResult[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const projectPath: string = useProjectStore((state) => state.projectPath)

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const folderPath = `${projectPath}/allure-results`
        const fileNodes = await window.api.readDirectory(folderPath)
        const resultFiles = fileNodes.filter(
          (file: { name: string; type: string; path: string }) =>
            file.type === 'file' && file.name.toLowerCase().includes('result')
        )
        const promises = resultFiles.map(async (file: { name: string; path: string }) => {
          const res = await window.api.readFile(file.path)
          if (res.success && res.data) {
            try {
              return JSON.parse(res.data)
            } catch (e: any) {
              toast.error(`Error parsing ${file.name}: ${e.message}`)
              return null
            }
          } else {
            toast.error(`Error reading ${file.name}: ${res.error}`)
            return null
          }
        })
        const fileData = await Promise.all(promises)
        let aggregated: TestResult[] = []
        fileData.forEach((data) => {
          if (data) {
            if (Array.isArray(data)) {
              aggregated = aggregated.concat(data)
            } else {
              aggregated.push(data)
            }
          }
        })

        const resultsWithScreenshots = await Promise.all(
          aggregated.map(async (result) => {
            if (result.attachments && result.attachments.length > 0) {
              const attachment = result.attachments[0]
              const screenshotPath = `${projectPath}/allure-results/${attachment.source}`
              console.log(screenshotPath)
              // Pass just the file path.
              result.screenshot = screenshotPath
            }
            return result
          })
        )
        setResults(resultsWithScreenshots)
      } catch (error: any) {
        toast.error('Error fetching dashboard: ' + error.message)
      } finally {
        setLoading(false)
      }
    }
    fetchDashboard()
  }, [projectPath])

  if (loading) return <div>Loading dashboard...</div>

  // Group results by status.
  const passedTests = results.filter((r) => r.status === 'passed')
  const failedTests = results.filter((r) => r.status === 'failed')
  const skippedTests = results.filter((r) => r.status === 'skipped')

  const passedCount = passedTests.length
  const failedCount = failedTests.length
  const skippedCount = skippedTests.length

  return (
    <div className="p-8">
      <div className="flex gap-8">
        <div className="w-1/2">
          <PieChartWidget passed={passedCount} failed={failedCount} skipped={skippedCount} />
        </div>
        <div className="w-1/2 flex flex-col gap-6">
          {passedTests.length > 0 && (
            <div>
              <h3 className="text-xl font-semibold mb-2">Passed</h3>
              {passedTests.map((result, index) => (
                <TestResultCard
                  key={`passed-${index}`}
                  name={result.name}
                  status={result.status}
                  screenshot={result.screenshot}
                />
              ))}
            </div>
          )}
          {failedTests.length > 0 && (
            <div>
              <h3 className="text-xl font-semibold mb-2">Failed</h3>
              {failedTests.map((result, index) => (
                <TestResultCard
                  key={`failed-${index}`}
                  name={result.name}
                  status={result.status}
                  screenshot={result.screenshot}
                />
              ))}
            </div>
          )}
          {skippedTests.length > 0 && (
            <div>
              <h3 className="text-xl font-semibold mb-2">Skipped</h3>
              {skippedTests.map((result, index) => (
                <TestResultCard
                  key={`skipped-${index}`}
                  name={result.name}
                  status={result.status}
                  screenshot={result.screenshot}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Dashboard
