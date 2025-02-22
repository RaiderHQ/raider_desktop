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

interface StatusDetails {
  message?: string
}

interface TestResult {
  name: string
  status: string
  attachments?: Attachment[]
  screenshot?: string
  statusDetails?: StatusDetails
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
  const totalCount = results.length

  return (
    <div className="p-2 min-h-fit sm:p-4 md:p-6 w-full flex flex-col">
      {/* Summary Section */}
      {totalCount > 0 && (
        <div className="mb-2 sm:mb-4 md:mb-6 p-4 border rounded bg-white">
          <h2 className="text-2xl font-bold mb-2">Overall Summary</h2>
          <p className="text-lg">Total Tests: <span className="font-semibold">{totalCount}</span></p>
          <p className="text-lg">Passed: <span className="font-semibold text-[#4caf50]">{passedCount}</span></p>
          <p className="text-lg">Failed: <span className="font-semibold text-[#f44336]">{failedCount}</span></p>
          <p className="text-lg">Skipped: <span className="font-semibold text-[#ff9800]">{skippedCount}</span></p>
        </div>
      )}

      <div className="flex flex-1 flex-col md:flex-row gap-4 sm:gap-6 md:gap-8">
        {/* Pie Chart Widget Column */}
        {totalCount > 0 && (
          <div className="items-center">
            <PieChartWidget passed={passedCount} failed={failedCount} skipped={skippedCount} />
          </div>
        )}

        {/* Test Results Column */}
        <div className="flex-1 flex flex-col border rounded shadow p-4 h-min">
          <div className="flex flex-col gap-4">
            {passedTests.length > 0 && (
              <div>
                <h3 className="text-xl font-semibold mb-2">Passed</h3>
                {passedTests.map((result, index) => (
                  <TestResultCard
                    key={`passed-${index}`}
                    name={result.name}
                    status={result.status}
                    screenshot={result.screenshot}
                    message={result.statusDetails?.message}
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
                    message={result.statusDetails?.message}
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
                    message={result.statusDetails?.message}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
