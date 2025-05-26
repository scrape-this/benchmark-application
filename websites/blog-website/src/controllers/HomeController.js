import db from '../database/db.js'

/**
 * Encapsulates a controller.
 */
export class HomeController {
  /**
   * Renders a view and sends the rendered HTML string as an HTTP response.
   * index GET.
   *
   * @param {object} req - Express request object.
   * @param {object} res - Express response object.
   * @param {Function} next - Express next middleware function.
   */
  index (req, res, next) {
    const currentPage = parseInt(req.query.page) || 1
    const viewData = this.getAllBlogPosts(currentPage)

    res.render('home/index', { viewData })
  }

  showBlogPost (req, res, next) {
    const viewData = this.getABlogPost(req.params.id)
    res.render('blog/post', { viewData })
  }

  getAllBlogPosts (page) {
    try {
      const offset = (page - 1) * 3
      const countReq = db.prepare('SELECT COUNT(*) AS count FROM Blog_posts')
      const postsCount = countReq.get().count

      const req = db.prepare('SELECT * FROM Blog_posts ORDER BY id ASC LIMIT 3 OFFSET ?')
      const blogs = req.all(offset)
      return {
        blogPosts: blogs.map(blog => ({
          ...blog,
          link: `./${blog.id}`,
          textPreview: blog.text_content.split(" ").slice(0, 10).join(" ") + "..."
        })),
        pages: Math.ceil(postsCount / 3),
        currentPage: page
      }
    } catch (err) {
      console.error(err)
    }
  }

  getPostsCount () {
    const countReq = db.prepare('SELECT COUNT(*) AS count FROM Blog_posts')
    return countReq.get().count
  }

  getABlogPost (id) {
    try {
      const countReq = db.prepare('SELECT COUNT(*) AS count FROM Blog_posts')
      const postsCount = countReq.get().count

      const req = db.prepare('SELECT * FROM Blog_posts WHERE id = ?')
      const post = req.get(id)
      return { post, postsCount}
    } catch (err) {
      console.error(err)
    }
  }
}