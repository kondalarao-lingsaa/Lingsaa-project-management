// STANDALONE ONLY - send the root URL to the PMS dashboard.
export const getServerSideProps = () => ({
  redirect: { destination: '/appModules/projects/dashboard/', permanent: false }
})

const Home = () => null

export default Home
