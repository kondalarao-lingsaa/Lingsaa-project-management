import React from 'react'
import { Button, Card, CardContent } from '@mui/material'
import { ThemeStyles } from 'src/universalThemeColors/themeColors'

// Catches a crash inside one PMS screen so the rest of the app (sidebar, header) keeps working,
// and lets the user retry that screen instead of facing a blank page.
class PmsErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('PMS screen error:', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <Card className={ThemeStyles.tableColor}>
        <CardContent className='flex flex-col items-start gap-3'>
          <p className={ThemeStyles.textSummary}>Something went wrong while showing this screen.</p>
          <Button variant='outlined' size='small' onClick={() => this.setState({ error: null })}>
            Try Again
          </Button>
        </CardContent>
      </Card>
    )
  }
}

export default PmsErrorBoundary
